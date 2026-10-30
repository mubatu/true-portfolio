from datetime import date
from decimal import Decimal
from typing import Annotated
from fastapi import APIRouter, Depends, Path, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.api.deps import CurrentUser
from app.db import get_db
from app.services.portfolio_service import (
    CorporateActionsUnavailable,
    analyze_portfolio,
    calculate_adjusted_transaction_values,
)

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
