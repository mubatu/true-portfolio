"""
Portfolio orchestration: decide which market data a portfolio needs, sync
it (``market_data``), keep split adjustments current, then hand the
loaded data to the pure ``analysis`` module.

Price basis: ``market_prices`` holds Yahoo's raw closes — restated for
splits, not for dividends — matching the split-adjusted transaction
fields. Cash dividends are counted separately as income by the ledger.
"""

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.markets import get_dividend_withholding_rate, get_market_benchmark
from app.services import analysis
from app.services.ledger import DividendEvent, LedgerTransaction, replay
from app.services.market_data import (
    ensure_market_data,
    load_closes,
    load_corporate_actions,
    load_sync_windows,
    split_factor_between_dates,
)

SPLIT_PRICE_SCALE = Decimal("0.00000001")
SPLIT_QUANTITY_SCALE = Decimal("0.00000001")


class CorporateActionsUnavailable(Exception):
    """Split data could not be obtained for a ticker."""

    def __init__(self, ticker: str):
        super().__init__(f"Corporate actions unavailable for {ticker}")
        self.ticker = ticker


# ------------------------------------------------------------------
# Public API
# ------------------------------------------------------------------

def analyze_portfolio(db: Session, portfolio_id: int) -> dict:
    """Sync market data if stale, then compute the full analysis."""
    yesterday = date.today() - timedelta(days=1)
    market = _portfolio_market(db, portfolio_id)
    benchmark = get_market_benchmark(market)
    transactions = _load_ledger_transactions(db, portfolio_id)

    if not transactions:
        return {
            "portfolio_id": portfolio_id,
            "market_data": {"synced": [], "failed": []},
            **analysis.build_analysis([], {}, [], [], yesterday),
            "warnings": [],
        }

    sync = ensure_market_data(db, _market_data_needs(transactions, benchmark, yesterday))
    if refresh_portfolio_adjusted_prices(db, portfolio_id)["transactions_updated"]:
        transactions = _load_ledger_transactions(db, portfolio_id)

    tickers = sorted({t.ticker for t in transactions})
    first_date = transactions[0].date
    closes = load_closes(
        db, tickers + ([benchmark] if benchmark else []), first_date, yesterday
    )
    benchmark_closes = closes.pop(benchmark, {}) if benchmark else {}
    actions = load_corporate_actions(db, tickers)

    dividends = sorted(
        (
            DividendEvent(
                ex_date=ex_date,
                ticker=ticker,
                gross_per_share=gross,
                withholding_rate=get_dividend_withholding_rate(market, ex_date),
            )
            for ticker in tickers
            for ex_date, gross in actions[ticker].dividends
            if ex_date <= yesterday
        ),
        key=lambda e: (e.ex_date, e.ticker),
    )

    result = analysis.build_analysis(
        transactions,
        closes,
        dividends,
        _open_days(benchmark_closes, closes, first_date, yesterday),
        as_of=yesterday,
    )
    warnings = [
        {"code": "market_data_unavailable", "ticker": ticker}
        for ticker in sync.failed
    ]
    return {
        "portfolio_id": portfolio_id,
        "market_data": {"synced": sync.synced, "failed": sync.failed},
        **result,
        "warnings": warnings,
    }


def calculate_adjusted_transaction_values(
    db: Session,
    ticker: str,
    quantity: Decimal,
    price: Decimal,
    txn_date: date,
) -> tuple[Decimal, Decimal, Decimal]:
    """Split-adjusted quantity & price of a transaction as of today.

    Cash dividends are not applied to transaction fields because they are
    cash-flow events (not share-count events).

    Raises ``CorporateActionsUnavailable`` if the ticker's split data is
    neither stored nor downloadable.
    """
    today = date.today()
    ensure_market_data(db, {ticker: (txn_date, today)}, today=today)
    if ticker not in load_sync_windows(db, [ticker]):
        raise CorporateActionsUnavailable(ticker)

    splits = load_corporate_actions(db, [ticker])[ticker].splits
    split_factor = split_factor_between_dates(splits, txn_date, today)
    if split_factor <= 0:
        split_factor = Decimal(1)

    adjusted_quantity = quantity * split_factor if split_factor != 1 else quantity
    adjusted_price = price / split_factor if split_factor != 1 else price
    return (
        _quantize_quantity(adjusted_quantity),
        _quantize_price(adjusted_price),
        split_factor,
    )


def refresh_portfolio_adjusted_prices(db: Session, portfolio_id: int) -> dict:
    """Refresh split-adjusted transaction fields from stored splits.

    Tickers that have never been synced are left untouched (and listed in
    ``tickers_failed``) instead of being reset to raw values.
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
            "tickers_failed": [],
        }

    as_of = date.today()
    tickers = sorted({row[1] for row in rows})
    synced = load_sync_windows(db, tickers)
    actions = load_corporate_actions(db, [t for t in tickers if t in synced])
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
        if ticker not in synced:
            continue

        base_quantity = Decimal(str(quantity))
        base_price = Decimal(str(price))
        split_factor = split_factor_between_dates(
            actions[ticker].splits, txn_date, as_of
        )
        new_adjusted_quantity = _quantize_quantity(
            base_quantity * split_factor if split_factor != 1 else base_quantity
        )
        new_adjusted_price = _quantize_price(
            base_price / split_factor if split_factor != 1 else base_price
        )

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

    if updates:
        db.execute(
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

    return {
        "transactions_processed": len(rows),
        "transactions_updated": len(updates),
        "tickers_failed": [t for t in tickers if t not in synced],
    }


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _market_data_needs(
    transactions: list[LedgerTransaction],
    benchmark: str | None,
    yesterday: date,
) -> dict[str, tuple[date, date]]:
    """Date window each ticker must cover: open positions through yesterday,
    fully closed ones only through their last trade."""
    ledger = replay(transactions, [])
    needs: dict[str, tuple[date, date]] = {}
    for txn in transactions:
        start, end = needs.get(txn.ticker, (txn.date, txn.date))
        needs[txn.ticker] = (min(start, txn.date), max(end, txn.date))

    for ticker, (start, end) in needs.items():
        if ledger.positions[ticker].quantity > 0:
            needs[ticker] = (start, yesterday)

    if benchmark:
        needs[benchmark] = (transactions[0].date, yesterday)
    return needs


def _open_days(
    benchmark_closes: dict[date, Decimal],
    closes: dict[str, dict[date, Decimal]],
    start: date,
    end: date,
) -> list[date]:
    """Market calendar: benchmark trading days, else any holding's trading
    days, else weekdays."""
    if benchmark_closes:
        return sorted(benchmark_closes)

    traded = {d for by_date in closes.values() for d in by_date}
    if traded:
        return sorted(traded)

    days = (start + timedelta(days=n) for n in range((end - start).days + 1))
    return [d for d in days if d.weekday() < 5]


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


def _portfolio_market(db: Session, portfolio_id: int) -> str | None:
    row = db.execute(
        text("SELECT market FROM portfolios WHERE id = :pid"),
        {"pid": portfolio_id},
    ).fetchone()
    return str(row[0]) if row and row[0] is not None else None


def _quantize_price(value: Decimal) -> Decimal:
    """Keep adjusted prices stable across refreshes."""
    return value.quantize(SPLIT_PRICE_SCALE)


def _quantize_quantity(value: Decimal) -> Decimal:
    """Keep adjusted quantities stable across refreshes."""
    return value.quantize(SPLIT_QUANTITY_SCALE)
