from datetime import date
from decimal import Decimal
from typing import Annotated
from fastapi import APIRouter, Depends, File, Form, Path, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.api.deps import CurrentUser
from app.db import get_db
from app.services.portfolio_service import (
    CorporateActionsUnavailable,
    InvalidRightsIssue,
    add_rights_issue,
    analyze_portfolio,
    calculate_adjusted_transaction_values,
    list_fund_prices,
    list_rights_issues,
    remove_rights_issue,
    upload_fund_prices,
)
from app.services.tefas import InvalidFundPrices

router = APIRouter(prefix="/portfolios", tags=["Portfolios"])

# Handlers are plain ``def``: they do blocking DB and Yahoo I/O, so FastAPI
# runs them in its threadpool instead of stalling the event loop.


def _ensure_portfolio_ownership(
    db: Session, portfolio_id: int, user_id: str
) -> None:
    """Ensure portfolio belongs to requesting user."""
    row = db.execute(
        text("SELECT id FROM portfolios WHERE id = :pid AND user_id = :uid"),
        {"pid": portfolio_id, "uid": user_id},
    ).fetchone()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Portfolio not found",
        )


@router.get("/{portfolio_id}/analyze")
def get_portfolio_analysis(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    portfolio_id: int = Path(..., description="The portfolio ID to analyze"),
):
    """
    Analyze a portfolio:
      1. Sync market data (prices, splits, dividends) for the portfolio's
         tickers and market benchmark — at most once a day per ticker.
      2. Refresh split-adjusted transaction fields.
      3. Compute holdings, realized results, dividends, totals and the
         daily performance series from stored data only.
    """
    _ensure_portfolio_ownership(db, portfolio_id, str(current_user.id))
    return analyze_portfolio(db, portfolio_id)


@router.get("/{portfolio_id}/adjusted-price")
def get_adjusted_transaction_price(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    portfolio_id: int = Path(..., description="The portfolio ID"),
    ticker: str = Query(..., min_length=1, description="Ticker symbol"),
    quantity: Decimal = Query(..., gt=0, description="Transaction quantity"),
    price: Decimal = Query(..., gt=0, description="Transaction price"),
    txn_date: date = Query(..., alias="date", description="Transaction date"),
):
    """Get split-adjusted transaction values for a transaction input."""
    _ensure_portfolio_ownership(db, portfolio_id, str(current_user.id))

    normalized_ticker = ticker.strip().upper()
    try:
        adjusted_quantity, adjusted_price, split_factor = calculate_adjusted_transaction_values(
            db,
            ticker=normalized_ticker,
            quantity=quantity,
            price=price,
            txn_date=txn_date,
        )
    except CorporateActionsUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Split data is temporarily unavailable for {exc.ticker}",
        ) from exc

    return {
        "portfolio_id": portfolio_id,
        "ticker": normalized_ticker,
        "date": txn_date.isoformat(),
        "quantity": float(quantity),
        "price": float(price),
        "adjusted_quantity": float(adjusted_quantity),
        "adjusted_price": float(adjusted_price),
        "split_factor": float(split_factor),
    }


# ── Rights issues (bedelli sermaye artırımı) ─────────────────────────────


class RightsIssueInput(BaseModel):
    ticker: str = Field(..., min_length=1, description="Full ticker, e.g. KONTR.IS")
    ex_date: date = Field(..., description="Hak kullanım başlangıç tarihi")
    ratio: Decimal = Field(..., gt=0, description="New shares per share (1 = %100)")
    subscription_price: Decimal = Field(..., ge=0, description="TL per new share")


@router.get("/{portfolio_id}/rights-issues")
def get_rights_issues(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    portfolio_id: int = Path(..., description="The portfolio ID"),
):
    """Rights issues the portfolio held shares for, with entitlements."""
    _ensure_portfolio_ownership(db, portfolio_id, str(current_user.id))
    return list_rights_issues(db, portfolio_id)


@router.post("/{portfolio_id}/rights-issues")
def create_rights_issue(
    payload: RightsIssueInput,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    portfolio_id: int = Path(..., description="The portfolio ID"),
):
    """Create or update a rights issue from its KAP announcement."""
    _ensure_portfolio_ownership(db, portfolio_id, str(current_user.id))
    try:
        return add_rights_issue(
            db,
            portfolio_id,
            ticker=payload.ticker.strip().upper(),
            ex_date=payload.ex_date,
            ratio=payload.ratio,
            subscription_price=payload.subscription_price,
        )
    except InvalidRightsIssue as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/{portfolio_id}/rights-issues/{ticker}/{ex_date}", status_code=204)
def delete_rights_issue_route(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    portfolio_id: int = Path(..., description="The portfolio ID"),
    ticker: str = Path(..., description="Full ticker, e.g. KONTR.IS"),
    ex_date: date = Path(..., description="Ex-date of the issue"),
):
    """Remove a rights issue (shared by all portfolios holding the ticker)."""
    _ensure_portfolio_ownership(db, portfolio_id, str(current_user.id))
    try:
        if not remove_rights_issue(db, portfolio_id, ticker.strip().upper(), ex_date):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    except InvalidRightsIssue as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


# ── Fund prices (TEFAS) ──────────────────────────────────────────────────

# A five-year TEFAS export is ~60 KB; anything far larger is not one.
MAX_PRICE_FILE_BYTES = 2_000_000


@router.get("/{portfolio_id}/fund-prices")
def get_fund_prices(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    portfolio_id: int = Path(..., description="The portfolio ID"),
):
    """Stored price range of each fund the portfolio holds."""
    _ensure_portfolio_ownership(db, portfolio_id, str(current_user.id))
    return list_fund_prices(db, portfolio_id)


@router.post("/{portfolio_id}/fund-prices")
def post_fund_prices(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    fund_code: Annotated[str, Form(description="TEFAS fund code, e.g. IPB")],
    file: Annotated[UploadFile, File(description="TEFAS 'Fon Verileri' Excel export")],
    portfolio_id: int = Path(..., description="The portfolio ID"),
):
    """Store a fund's daily prices from a TEFAS Excel export (merged with
    what is stored; prices are shared by every portfolio holding the fund)."""
    _ensure_portfolio_ownership(db, portfolio_id, str(current_user.id))
    content = file.file.read(MAX_PRICE_FILE_BYTES + 1)
    if len(content) > MAX_PRICE_FILE_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="file_too_large")
    try:
        return upload_fund_prices(db, portfolio_id, fund_code, content)
    except InvalidFundPrices as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
