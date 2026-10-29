"""
Portfolio analysis: market-price backfill, split adjustments, P/L and the
daily performance series.

Price basis
-----------
``market_prices.close`` stores Yahoo's *raw* close (``auto_adjust=False``).
Yahoo restates raw closes for stock splits but **not** for dividends, which
matches how transactions are stored (``adjusted_quantity`` /
``adjusted_price`` are split-adjusted only). Cash dividends are counted
separately as income via the ledger (see ``app.services.ledger``).

Backfill logic per ticker:
1. Replay buy/sell transactions chronologically to find date ranges
   where the user holds ≥ 1 share.
2. Download daily raw closes for those ranges (always excluding today).
3. Compare the download with what is already stored. If stored closes
   disagree (a split happened since, or legacy dividend-adjusted rows),
   rewrite *every* stored date of the ticker in one transaction, so other
   portfolios sharing the same rows are fixed too. Otherwise just insert
   the missing dates.
"""

from datetime import date, timedelta
from decimal import Decimal

import pandas as pd
import yfinance as yf
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.core.markets import (
    get_dividend_withholding_rate,
    get_market_benchmark_candidates,
)
from app.services.corporate_actions import (
    fetch_corporate_actions,
    split_factor_between_dates,
)
from app.services.ledger import (
    DividendEvent,
    Ledger,
    LedgerTransaction,
    group_by_date,
    replay,
)

SPLIT_PRICE_SCALE = Decimal("0.00000001")
SPLIT_QUANTITY_SCALE = Decimal("0.00000001")

# Raw closes keep 6 decimals: split-restated history is not tick-aligned
# (e.g. 227.40 / 7 = 32.485714).
CLOSE_DECIMALS = 6

# A stored close differing from a fresh download by more than both
# thresholds means the stored history is on a different basis.
PRICE_MISMATCH_ABS = Decimal("0.01")
PRICE_MISMATCH_REL = Decimal("0.0005")


class CorporateActionsUnavailable(Exception):
    """Split/dividend data could not be fetched for a ticker."""

    def __init__(self, ticker: str):
        super().__init__(f"Corporate actions unavailable for {ticker}")
        self.ticker = ticker


# ------------------------------------------------------------------
# Public API
# ------------------------------------------------------------------

def backfill_portfolio_prices(db: Session, portfolio_id: int) -> dict:
    """Download & store missing market prices for every ticker in the portfolio.

    Returns a short summary dict (ticker → number of rows written) plus the
    tickers whose stored history was rewritten.
    """
    tickers = _distinct_tickers(db, portfolio_id)
    if not tickers:
        return {"tickers_processed": 0}

    summary: dict[str, int] = {}
    refreshed: list[str] = []

    for ticker in tickers:
        hold_ranges = _holding_ranges(db, portfolio_id, ticker)
        if not hold_ranges:
            summary[ticker] = 0
            continue

        # Merge ranges into one yfinance download window
        dl_start = min(r[0] for r in hold_ranges)
        dl_end = max(r[1] for r in hold_ranges)

        prices = _download_prices(ticker, dl_start, dl_end)
        if prices.empty:
            summary[ticker] = 0
            continue

        stored = _stored_prices(db, ticker)
        if _prices_disagree(stored, prices):
            summary[ticker] = _rewrite_ticker_history(
                db, ticker, stored, prices, hold_ranges
            )
            refreshed.append(ticker)
            continue

        prices = _filter_to_ranges(prices, hold_ranges)
        summary[ticker] = _upsert_prices(db, ticker, prices, overwrite=False)

    return {
        "tickers_processed": len(tickers),
        "details": summary,
        "refreshed_tickers": refreshed,
    }


def calculate_adjusted_transaction_price(
    ticker: str,
    price: Decimal,
    txn_date: date,
    as_of: date | None = None,
) -> tuple[Decimal, Decimal]:
    """Calculate split-adjusted transaction price as of the given date.

    Returns ``(adjusted_price, split_factor)`` where:
      - ``split_factor`` is the cumulative product of split ratios
        in ``(txn_date, as_of]``.
      - ``adjusted_price`` is ``price / split_factor``.

    Raises ``CorporateActionsUnavailable`` if split data cannot be fetched.
    """
    split_factor = _split_factor_for(ticker, txn_date, as_of or date.today())
    adjusted_price = price / split_factor if split_factor != 1 else price
    return _quantize_price(adjusted_price), split_factor


def calculate_adjusted_transaction_values(
    ticker: str,
    quantity: Decimal,
    price: Decimal,
    txn_date: date,
    as_of: date | None = None,
) -> tuple[Decimal, Decimal, Decimal]:
    """Calculate split-adjusted quantity & price as of the given date.

    Cash dividends are not applied to transaction fields because they are
    cash-flow events (not share-count events).

    Raises ``CorporateActionsUnavailable`` if split data cannot be fetched.
    """
    split_factor = _split_factor_for(ticker, txn_date, as_of or date.today())

    adjusted_quantity = (
        quantity * split_factor if split_factor != 1 else quantity
    )
    adjusted_price = price / split_factor if split_factor != 1 else price
    return (
        _quantize_quantity(adjusted_quantity),
        _quantize_price(adjusted_price),
        split_factor,
    )


def refresh_portfolio_adjusted_prices(db: Session, portfolio_id: int) -> dict:
    """Refresh split-adjusted transaction fields for a portfolio.

    Tickers whose split data cannot be fetched are left untouched (and
    listed in ``tickers_failed``) instead of being reset to raw values.
    """
    rows = db.execute(
        text(
            """
            SELECT id, ticker, quantity, price, adjusted_quantity, adjusted_price, date
            FROM transactions
            WHERE portfolio_id = :pid
            ORDER BY ticker, date, id
            """
        ),
        {"pid": portfolio_id},
    ).fetchall()

    if not rows:
        return {
            "transactions_processed": 0,
            "transactions_updated": 0,
            "tickers_processed": 0,
            "tickers_failed": [],
        }

    as_of = date.today()
    split_cache: dict[str, tuple[tuple[date, Decimal], ...] | None] = {}
    updates: list[dict[str, Decimal | int]] = []

    for (
        txn_id,
        ticker,
        quantity,
        price,
        adjusted_quantity,
        adjusted_price,
        txn_date,
    ) in rows:
        if ticker not in split_cache:
            actions = fetch_corporate_actions(ticker)
            split_cache[ticker] = actions.splits if actions is not None else None

        split_events = split_cache[ticker]
        if split_events is None:
            continue

        base_quantity = Decimal(str(quantity))
        base_price = Decimal(str(price))
        split_factor = split_factor_between_dates(split_events, txn_date, as_of)
        new_adjusted_quantity = (
            base_quantity * split_factor if split_factor != 1 else base_quantity
        )
        new_adjusted_quantity = _quantize_quantity(new_adjusted_quantity)
        new_adjusted_price = (
            base_price / split_factor if split_factor != 1 else base_price
        )
        new_adjusted_price = _quantize_price(new_adjusted_price)

        current_adjusted_quantity = (
            _quantize_quantity(Decimal(str(adjusted_quantity)))
            if adjusted_quantity is not None
            else None
        )
        current_adjusted_price = (
            _quantize_price(Decimal(str(adjusted_price)))
            if adjusted_price is not None
            else None
        )
        if (
            current_adjusted_quantity == new_adjusted_quantity
            and current_adjusted_price == new_adjusted_price
        ):
            continue

        updates.append(
            {
                "id": int(txn_id),
                "adjusted_quantity": new_adjusted_quantity,
                "adjusted_price": new_adjusted_price,
            }
        )

    updated_count = 0
    if updates:
        result = db.execute(
            text(
                """
                UPDATE transactions
                SET adjusted_quantity = :adjusted_quantity,
                    adjusted_price = :adjusted_price
                WHERE id = :id
                """
            ),
            updates,
        )
        db.commit()
        if result.rowcount is None or result.rowcount < 0:
            updated_count = len(updates)
        else:
            updated_count = result.rowcount

    failed = sorted(t for t, splits in split_cache.items() if splits is None)
    return {
        "transactions_processed": len(rows),
        "transactions_updated": updated_count,
        "tickers_processed": len(split_cache) - len(failed),
        "tickers_failed": failed,
    }


def calculate_portfolio_performance_series(db: Session, portfolio_id: int) -> dict:
    """Build a daily normalized performance series (base value = 100).

    Range:
      - start = first buy date in the portfolio
      - end = yesterday (today is excluded)

    Method:
      - Replays transactions and cash dividends with the shared ledger, so
        the series uses exactly the same math as the metric cards.
      - On each included trading day, computes index as:
          100 + (total_pl_pct_of_that_day)
    """
    yesterday = date.today() - timedelta(days=1)
    transactions = _load_ledger_transactions(db, portfolio_id)

    first_buy_date = next(
        (txn.date for txn in transactions if txn.operation == "buy"), None
    )
    if first_buy_date is None:
        return {"start_date": None, "end_date": None, "points": []}

    if first_buy_date > yesterday:
        return {
            "start_date": first_buy_date.isoformat(),
            "end_date": yesterday.isoformat(),
            "points": [],
        }

    tickers = sorted({txn.ticker for txn in transactions})
    dividends, _ = _load_dividend_events(db, portfolio_id, tickers, yesterday)
    prices_by_date = _market_prices_by_date(
        db,
        tickers=tickers,
        start_date=first_buy_date,
        end_date=yesterday,
    )
    open_days = _market_open_days(
        db,
        portfolio_id=portfolio_id,
        start_date=first_buy_date,
        end_date=yesterday,
        tickers=tickers,
    )

    events_by_day = group_by_date(
        (txn for txn in transactions if txn.date <= yesterday), dividends
    )

    base_value = Decimal(100)
    ledger = Ledger()
    latest_closes: dict[str, Decimal] = {}
    points: list[dict] = []

    # Events before the first buy (e.g. stray sells) still move the cash.
    for day in sorted(d for d in events_by_day if d < first_buy_date):
        ledger.apply_day(*events_by_day[day])

    current_day = first_buy_date
    while current_day <= yesterday:
        day_events = events_by_day.get(current_day)
        if day_events is not None:
            ledger.apply_day(*day_events)

        for ticker, close in prices_by_date.get(current_day, []):
            latest_closes[ticker] = close

        if current_day in open_days:
            total_pl = (
                ledger.realized_total
                + ledger.dividend_total
                + ledger.unrealized_total(latest_closes)
            )
            pl_pct = (
                (total_pl / ledger.pocket) * Decimal(100)
                if ledger.pocket > 0
                else Decimal(0)
            )
            index_value = base_value + pl_pct
            if not points:
                # Normalize first plotted trading day to the base line.
                points.append(
                    {
                        "date": current_day.isoformat(),
                        "price": 100.0,
                        "pl_pct": 0.0,
                    }
                )
            else:
                points.append(
                    {
                        "date": current_day.isoformat(),
                        "price": round(float(index_value), 4),
                        "pl_pct": round(float(pl_pct), 4),
                    }
                )

        current_day += timedelta(days=1)

    return {
        "start_date": first_buy_date.isoformat(),
        "end_date": yesterday.isoformat(),
        "points": points,
    }


def calculate_portfolio_pl(db: Session, portfolio_id: int) -> dict:
    """Calculate profit/loss for every ticker in the portfolio.

    Uses the **average cost** method and the pocket/safe cash model of the
    shared ledger. Total P/L = realized + unrealized + net dividends.

    A single ticker can appear in *both* current_holdings (if shares are
    still held) and closed_positions (if any shares were sold).
    """
    transactions = _load_ledger_transactions(db, portfolio_id)
    if not transactions:
        return {
            "current_holdings": [],
            "closed_positions": [],
            "dividends": _dividends_payload(Ledger()),
            "totals": _empty_totals(),
            "warnings": [],
        }

    yesterday = date.today() - timedelta(days=1)
    tickers = sorted({txn.ticker for txn in transactions})
    dividends, failed_tickers = _load_dividend_events(
        db, portfolio_id, tickers, yesterday
    )
    ledger = replay(transactions, dividends)

    current_holdings: list[dict] = []
    closed_positions: list[dict] = []

    for ticker in tickers:
        position = ledger.positions.get(ticker)
        if position is None:
            continue

        # If there was any realized P/L, show in closed positions
        if position.sold_value > 0:
            realized_pct = (
                float(position.realized_pl / position.sold_cost * 100)
                if position.sold_cost > 0
                else 0.0
            )
            closed_positions.append({
                "ticker": ticker,
                "total_invested": float(position.sold_cost),
                "total_returned": float(position.sold_value),
                "realized_pl": float(position.realized_pl),
                "realized_pl_pct": round(realized_pct, 2),
            })

        # If shares are still held, show in current holdings
        if position.quantity > 0:
            latest_price = _latest_price(db, ticker)
            if latest_price is not None:
                current_value = position.quantity * latest_price
                unrealized = position.quantity * (latest_price - position.avg_cost)
            else:
                current_value = position.cost_basis
                unrealized = Decimal(0)

            unrealized_pct = (
                float(unrealized / position.cost_basis * 100)
                if position.cost_basis > 0
                else 0.0
            )
            current_holdings.append({
                "ticker": ticker,
                "quantity": float(position.quantity),
                "avg_cost": float(position.avg_cost),
                "current_price": float(latest_price) if latest_price else None,
                "current_value": float(current_value),
                "cost_basis": float(position.cost_basis),
                "unrealized_pl": float(unrealized),
                "unrealized_pl_pct": round(unrealized_pct, 2),
            })

    totals = _aggregate_totals(
        current_holdings,
        closed_positions,
        dividend_income=ledger.dividend_total,
        pocket=ledger.pocket,
        safe=ledger.safe,
    )
    warnings = [
        {"code": "dividends_unavailable", "ticker": ticker}
        for ticker in failed_tickers
    ]
    return {
        "current_holdings": current_holdings,
        "closed_positions": closed_positions,
        "dividends": _dividends_payload(ledger),
        "totals": totals,
        "warnings": warnings,
    }


# ------------------------------------------------------------------
# Ledger inputs
# ------------------------------------------------------------------

def _load_ledger_transactions(
    db: Session, portfolio_id: int
) -> list[LedgerTransaction]:
    rows = db.execute(
        text(
            """
            SELECT
                date,
                ticker,
                operation,
                COALESCE(adjusted_quantity, quantity),
                COALESCE(adjusted_price, price)
            FROM transactions
            WHERE portfolio_id = :pid
            ORDER BY date, id
            """
        ),
        {"pid": portfolio_id},
    ).fetchall()

    return [
        LedgerTransaction(
            date=txn_date,
            ticker=ticker,
            operation="buy" if operation.lower() == "buy" else "sell",
            quantity=Decimal(str(quantity)),
            price=Decimal(str(price)),
        )
        for txn_date, ticker, operation, quantity, price in rows
    ]


def _load_dividend_events(
    db: Session,
    portfolio_id: int,
    tickers: list[str],
    until: date,
) -> tuple[list[DividendEvent], list[str]]:
    """Cash dividends with ex-date ≤ ``until`` and the tickers that failed.

    ``until`` matches the price horizon (yesterday): a dividend going ex
    today is not credited yet because today's price drop is not in the
    valuation either.
    """
    market = _portfolio_market(db, portfolio_id)
    events: list[DividendEvent] = []
    failed: list[str] = []

    for ticker in tickers:
        actions = fetch_corporate_actions(ticker)
        if actions is None:
            failed.append(ticker)
            continue

        for ex_date, gross_per_share in actions.dividends:
            if ex_date > until:
                continue
            events.append(
                DividendEvent(
                    ex_date=ex_date,
                    ticker=ticker,
                    gross_per_share=gross_per_share,
                    withholding_rate=get_dividend_withholding_rate(market, ex_date),
                )
            )

    events.sort(key=lambda e: (e.ex_date, e.ticker))
    return events, failed


def _split_factor_for(ticker: str, txn_date: date, as_of: date) -> Decimal:
    actions = fetch_corporate_actions(ticker)
    if actions is None:
        raise CorporateActionsUnavailable(ticker)

    split_factor = split_factor_between_dates(actions.splits, txn_date, as_of)
    return split_factor if split_factor > 0 else Decimal(1)


# ------------------------------------------------------------------
# P/L helpers
# ------------------------------------------------------------------

def _latest_price(db: Session, ticker: str) -> Decimal | None:
    """Get the most recent close price from market_prices (before today)."""
    row = db.execute(
        text(
            """
            SELECT close FROM market_prices
            WHERE ticker = :ticker AND date < CURRENT_DATE
            ORDER BY date DESC
            LIMIT 1
            """
        ),
        {"ticker": ticker},
    ).fetchone()
    return Decimal(str(row[0])) if row else None


def _aggregate_totals(
    current_holdings: list[dict],
    closed_positions: list[dict],
    dividend_income: Decimal,
    pocket: Decimal,
    safe: Decimal,
) -> dict:
    """Build portfolio-wide totals using pocket/safe cash-flow model."""
    portfolio_value = sum(h["current_value"] for h in current_holdings)
    realized = sum(c["realized_pl"] for c in closed_positions)
    unrealized = sum(h["unrealized_pl"] for h in current_holdings)
    dividends = float(dividend_income)
    total_pl = realized + unrealized + dividends
    total_pl_pct = (
        float(total_pl / float(pocket) * 100) if pocket > 0 else 0.0
    )

    return {
        "total_invested": round(float(pocket), 2),
        "portfolio_value": round(portfolio_value, 2),
        "in_the_safe": round(float(safe), 2),
        "realized_pl": round(realized, 2),
        "unrealized_pl": round(unrealized, 2),
        "dividend_income": round(dividends, 2),
        "total_pl": round(total_pl, 2),
        "total_pl_pct": round(total_pl_pct, 2),
    }


def _empty_totals() -> dict:
    return {
        "total_invested": 0,
        "portfolio_value": 0,
        "in_the_safe": 0,
        "realized_pl": 0,
        "unrealized_pl": 0,
        "dividend_income": 0,
        "total_pl": 0,
        "total_pl_pct": 0,
    }


def _dividends_payload(ledger: Ledger) -> dict:
    receipts = sorted(
        ledger.dividend_receipts, key=lambda r: (r.ex_date, r.ticker), reverse=True
    )
    total_gross = sum((r.gross_amount for r in receipts), Decimal(0))
    total_net = sum((r.net_amount for r in receipts), Decimal(0))
    return {
        "total_gross": round(float(total_gross), 2),
        "total_net": round(float(total_net), 2),
        "receipts": [
            {
                "ex_date": r.ex_date.isoformat(),
                "ticker": r.ticker,
                "quantity": float(r.quantity),
                "gross_per_share": float(r.gross_per_share),
                "withholding_rate": float(r.withholding_rate),
                "gross_amount": round(float(r.gross_amount), 2),
                "net_amount": round(float(r.net_amount), 2),
            }
            for r in receipts
        ],
    }


# ------------------------------------------------------------------
# Internal helpers (backfill)
# ------------------------------------------------------------------

def _distinct_tickers(db: Session, portfolio_id: int) -> list[str]:
    rows = db.execute(
        text("SELECT DISTINCT ticker FROM transactions WHERE portfolio_id = :pid"),
        {"pid": portfolio_id},
    ).fetchall()
    return [r[0] for r in rows]


def _market_prices_by_date(
    db: Session,
    tickers: list[str],
    start_date: date,
    end_date: date,
) -> dict[date, list[tuple[str, Decimal]]]:
    if not tickers:
        return {}

    stmt = (
        text(
            """
            SELECT ticker, date, close
            FROM market_prices
            WHERE ticker IN :tickers
              AND date BETWEEN :start_date AND :end_date
            ORDER BY date, ticker
            """
        )
        .bindparams(bindparam("tickers", expanding=True))
    )

    rows = db.execute(
        stmt,
        {
            "tickers": tickers,
            "start_date": start_date,
            "end_date": end_date,
        },
    ).fetchall()

    prices_by_date: dict[date, list[tuple[str, Decimal]]] = {}
    for ticker, price_date, close in rows:
        prices_by_date.setdefault(price_date, []).append(
            (ticker, Decimal(str(close)))
        )
    return prices_by_date


def _portfolio_market(db: Session, portfolio_id: int) -> str | None:
    row = db.execute(
        text("SELECT market FROM portfolios WHERE id = :pid"),
        {"pid": portfolio_id},
    ).fetchone()
    return str(row[0]) if row and row[0] is not None else None


def _market_open_days(
    db: Session,
    portfolio_id: int,
    start_date: date,
    end_date: date,
    tickers: list[str],
) -> set[date]:
    """Return open trading days for the portfolio market in [start_date, end_date]."""
    if end_date < start_date:
        return set()

    market = _portfolio_market(db, portfolio_id)
    candidates = get_market_benchmark_candidates(market)
    for benchmark in candidates:
        prices = _download_prices(benchmark, start_date, end_date)
        if not prices.empty:
            return set(prices["date"].tolist())

    # Fallback 1: infer open days from any traded ticker by downloading its
    # full range directly from yfinance (not restricted to holding ranges).
    for ticker in tickers:
        prices = _download_prices(ticker, start_date, end_date)
        if not prices.empty:
            return set(prices["date"].tolist())

    # Fallback 2: weekdays only.
    open_days: set[date] = set()
    current_day = start_date
    while current_day <= end_date:
        if current_day.weekday() < 5:
            open_days.add(current_day)
        current_day += timedelta(days=1)
    return open_days


def _holding_ranges(
    db: Session, portfolio_id: int, ticker: str
) -> list[tuple[date, date]]:
    """Return a list of [start, end] date pairs where quantity held ≥ 1.

    ``end`` is capped at yesterday (today is always excluded).
    """
    rows = db.execute(
        text(
            """
            SELECT operation, COALESCE(adjusted_quantity, quantity), date
            FROM transactions
            WHERE portfolio_id = :pid AND ticker = :ticker
            ORDER BY date, id
            """
        ),
        {"pid": portfolio_id, "ticker": ticker},
    ).fetchall()

    yesterday = date.today() - timedelta(days=1)
    qty = Decimal(0)
    ranges: list[tuple[date, date]] = []
    range_start: date | None = None

    for operation, quantity, txn_date in rows:
        prev_qty = qty
        if operation.lower() == "buy":
            qty += Decimal(str(quantity))
        else:
            qty -= Decimal(str(quantity))

        # Crossed from 0 → positive
        if prev_qty <= 0 < qty and range_start is None:
            range_start = txn_date

        # Crossed from positive → 0
        if prev_qty > 0 and qty <= 0 and range_start is not None:
            end = min(txn_date, yesterday)
            if range_start <= end:
                ranges.append((range_start, end))
            range_start = None

    # Still holding → range extends to yesterday
    if qty > 0 and range_start is not None:
        if range_start <= yesterday:
            ranges.append((range_start, yesterday))

    return ranges


def _download_prices(ticker: str, start: date, end: date) -> pd.DataFrame:
    """Download daily raw (split-restated, not dividend-adjusted) closes.

    Returns a DataFrame with columns ``date`` and ``close``.
    ``end`` is *inclusive* in our semantics; yfinance ``end`` is exclusive,
    so we add one day.
    """
    yf_end = end + timedelta(days=1)
    try:
        df = yf.download(
            ticker,
            start=str(start),
            end=str(yf_end),
            auto_adjust=False,
            progress=False,
        )
    except Exception:
        return pd.DataFrame()

    if df.empty:
        return pd.DataFrame()

    # Flatten MultiIndex columns that yfinance sometimes returns
    if isinstance(df.columns, pd.MultiIndex):
        df = df.droplevel("Ticker", axis=1)

    df = df.reset_index()
    df = df[["Date", "Close"]].dropna(subset=["Close"])
    df = df.rename(columns={"Date": "date", "Close": "close"})
    df["date"] = pd.to_datetime(df["date"]).dt.date
    df["close"] = df["close"].apply(lambda x: round(float(x), CLOSE_DECIMALS))

    # Exclude today
    today = date.today()
    df = df[df["date"] < today]
    return df


def _filter_to_ranges(
    prices: pd.DataFrame, ranges: list[tuple[date, date]]
) -> pd.DataFrame:
    """Keep only rows whose date falls inside at least one holding range."""
    mask = pd.Series(False, index=prices.index)
    for rng_start, rng_end in ranges:
        mask |= (prices["date"] >= rng_start) & (prices["date"] <= rng_end)
    return prices[mask].reset_index(drop=True)


def _stored_prices(db: Session, ticker: str) -> dict[date, Decimal]:
    rows = db.execute(
        text("SELECT date, close FROM market_prices WHERE ticker = :ticker"),
        {"ticker": ticker},
    ).fetchall()
    return {price_date: Decimal(str(close)) for price_date, close in rows}


def _prices_disagree(stored: dict[date, Decimal], fresh: pd.DataFrame) -> bool:
    """True if any overlapping date has a materially different close."""
    if not stored or fresh.empty:
        return False

    for price_date, close in zip(fresh["date"], fresh["close"]):
        stored_close = stored.get(price_date)
        if stored_close is None:
            continue

        fresh_close = Decimal(str(close))
        diff = abs(stored_close - fresh_close)
        if diff > PRICE_MISMATCH_ABS and diff > abs(fresh_close) * PRICE_MISMATCH_REL:
            return True
    return False


def _rewrite_ticker_history(
    db: Session,
    ticker: str,
    stored: dict[date, Decimal],
    window_prices: pd.DataFrame,
    hold_ranges: list[tuple[date, date]],
) -> int:
    """Overwrite every stored date of ``ticker`` plus this portfolio's ranges.

    Runs as a single transaction, so readers never see a half-written
    history and other portfolios' dates are refreshed rather than deleted.
    """
    window_start = window_prices["date"].min()
    window_end = window_prices["date"].max()
    full_start = min(window_start, min(stored))
    full_end = max(window_end, max(stored))

    if full_start < window_start or full_end > window_end:
        prices = _download_prices(ticker, full_start, full_end)
        if prices.empty:
            return 0
    else:
        prices = window_prices

    in_ranges = _filter_to_ranges(prices, hold_ranges)
    already_stored = prices[prices["date"].isin(list(stored))]
    rows = (
        pd.concat([in_ranges, already_stored])
        .drop_duplicates(subset=["date"])
        .reset_index(drop=True)
    )
    return _upsert_prices(db, ticker, rows, overwrite=True)


def _upsert_prices(
    db: Session, ticker: str, prices: pd.DataFrame, overwrite: bool
) -> int:
    """Insert prices; on conflict keep (``overwrite=False``) or replace them."""
    if prices.empty:
        return 0

    values = [
        {"ticker": ticker, "date": r["date"], "close": r["close"]}
        for _, r in prices.iterrows()
    ]
    on_conflict = (
        "DO UPDATE SET close = EXCLUDED.close" if overwrite else "DO NOTHING"
    )

    result = db.execute(
        text(
            f"""
            INSERT INTO market_prices (ticker, date, close)
            VALUES (:ticker, :date, :close)
            ON CONFLICT (ticker, date) {on_conflict}
            """
        ),
        values,
    )
    db.commit()
    return result.rowcount


def _quantize_price(value: Decimal) -> Decimal:
    """Keep adjusted prices stable across refreshes."""
    return value.quantize(SPLIT_PRICE_SCALE)


def _quantize_quantity(value: Decimal) -> Decimal:
    """Keep adjusted quantities stable across refreshes."""
    return value.quantize(SPLIT_QUANTITY_SCALE)
