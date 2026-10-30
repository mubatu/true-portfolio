"""
Portfolio orchestration: decide which market data a portfolio needs, sync
it (``market_data``), keep split adjustments current, then hand the
loaded data to the pure ``analysis`` module.

Price basis: ``market_prices`` holds Yahoo's raw closes — restated for
splits, not for dividends — matching the split-adjusted transaction
fields. Cash dividends are counted separately as income by the ledger.
Rights issues Yahoo restated silently are undone on read (``rights``), and
so are splits Yahoo applied to only part of the history (``split_corrections``).
"""

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.markets import (
    GOLD_USD_TICKER,
    get_dividend_withholding_rate,
    get_market_benchmark,
    get_market_config,
    last_settled_day,
    uses_uploaded_prices,
)
from app.services import analysis, tefas
from app.services.ledger import DividendEvent, LedgerTransaction, replay
from app.services.market_data import (
    adjust_unadjusted_closes,
    delete_rights_issue,
    ensure_market_data,
    load_closes,
    load_corporate_actions,
    load_price_ranges,
    load_rights_issues,
    load_sync_windows,
    save_rights_issue,
    save_uploaded_closes,
    split_factor_between_dates,
)
from app.services.rights import RightsIssue, correct_closes, correct_dividend

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
    market = _portfolio_market(db, portfolio_id)
    # Today once the market has closed, else yesterday.
    as_of = last_settled_day(market)
    benchmark = get_market_benchmark(market)
    config = get_market_config(market)
    usd = config.usd_ticker if config else None
    # Comparison lines: ticker → key of analysis.COMPARISONS (gold via USD).
    comparison_tickers = {
        ticker: key
        for ticker, key in ((benchmark, "benchmark"), (usd, "usd"), (usd and GOLD_USD_TICKER, "gold"))
        if ticker
    }
    transactions = _load_ledger_transactions(db, portfolio_id)

    if not transactions:
        return {
            "portfolio_id": portfolio_id,
            "market_data": {"synced": [], "failed": []},
            **analysis.build_analysis([], {}, [], [], as_of),
            "warnings": [],
        }

    sync = ensure_market_data(
        db, _market_data_needs(transactions, list(comparison_tickers), as_of), settled=as_of
    )
    if refresh_portfolio_adjusted_prices(db, portfolio_id)["transactions_updated"]:
        transactions = _load_ledger_transactions(db, portfolio_id)

    tickers = sorted({t.ticker for t in transactions})
    first_date = transactions[0].date
    closes = load_closes(db, tickers, first_date, as_of)
    # From a little earlier, so each line has a close to start from even if
    # its market was shut on the first trade day.
    reference = load_closes(
        db, list(comparison_tickers), first_date - COMPARISON_LOOKBACK, as_of
    )
    comparison_closes = {
        key: reference.get(ticker, {})
        for ticker, key in comparison_tickers.items()
        if key != "gold"
    }
    if "gold" in comparison_tickers.values():
        comparison_closes["gold"] = analysis.gram_gold_try(
            reference.get(GOLD_USD_TICKER, {}), comparison_closes["usd"]
        )
    benchmark_closes = comparison_closes.get("benchmark", {})
    actions = load_corporate_actions(db, tickers)
    issues = load_rights_issues(db, tickers)
    closes = {
        t: correct_closes(
            adjust_unadjusted_closes(c, actions[t].unadjusted_closes), issues.get(t, [])
        )
        for t, c in closes.items()
    }

    dividends = sorted(
        (
            DividendEvent(
                ex_date=ex_date,
                ticker=ticker,
                gross_per_share=correct_dividend(ex_date, gross, issues[ticker]),
                withholding_rate=get_dividend_withholding_rate(market, ex_date),
            )
            for ticker in tickers
            for ex_date, gross in actions[ticker].dividends
            if ex_date <= as_of
        ),
        key=lambda e: (e.ex_date, e.ticker),
    )

    open_days = _open_days(benchmark_closes, closes, first_date, as_of)
    result = analysis.build_analysis(
        transactions,
        closes,
        dividends,
        open_days,
        as_of=as_of,
        comparison_closes=comparison_closes,
    )
    _sales_in_closing_basis(result["positions"], actions, date.today())
    rights_issues = _rights_summary(transactions, issues)
    warnings = [
        {"code": "market_data_unavailable", "ticker": ticker}
        for ticker in sync.failed
    ] + [
        {"code": "rights_issue_review", "ticker": r["ticker"]}
        for r in rights_issues
        if r["needs_review"]
    ] + [
        {"code": "fund_prices_outdated", "ticker": ticker}
        for ticker in _outdated_uploaded_prices(transactions, closes, open_days)
    ]
    return {
        "portfolio_id": portfolio_id,
        "market_data": {"synced": sync.synced, "failed": sync.failed},
        **result,
        "rights_issues": rights_issues,
        "warnings": warnings,
    }


# ------------------------------------------------------------------
# Uploaded fund prices (TEFAS)
# ------------------------------------------------------------------

# Market days a held fund may go without an uploaded price before its
# prices count as outdated (weekends and holidays are not market days).
UPLOADED_PRICES_MAX_MISSING_DAYS = 2


def upload_fund_prices(
    db: Session, portfolio_id: int, fund_code: str, content: bytes
) -> dict:
    """Store a fund's daily prices from a TEFAS Excel export.

    Raises ``tefas.InvalidFundPrices`` for a non-fund portfolio, a bad
    fund code or an unreadable file.
    """
    config = get_market_config(_portfolio_market(db, portfolio_id))
    if config is None or config.price_source != "upload":
        raise tefas.InvalidFundPrices("not_fund_portfolio")
    ticker = tefas.normalize_fund_code(fund_code) + config.yfinance_suffix
    prices = tefas.parse_price_export(content)
    save_uploaded_closes(db, ticker, prices)
    return next(r for r in list_fund_prices(db, portfolio_id, [ticker]) if r["ticker"] == ticker)


def list_fund_prices(
    db: Session, portfolio_id: int, extra_tickers: list[str] | None = None
) -> list[dict]:
    """Stored price range of each upload-priced ticker of the portfolio."""
    tickers = {
        t.ticker for t in _load_ledger_transactions(db, portfolio_id)
        if uses_uploaded_prices(t.ticker)
    } | set(extra_tickers or [])
    ranges = load_price_ranges(db, sorted(tickers))
    return [
        {
            "ticker": ticker,
            "first_date": ranges[ticker][0].isoformat() if ticker in ranges else None,
            "last_date": ranges[ticker][1].isoformat() if ticker in ranges else None,
            "days": ranges[ticker][2] if ticker in ranges else 0,
        }
        for ticker in sorted(tickers)
    ]


def _outdated_uploaded_prices(
    transactions: list[LedgerTransaction],
    closes: dict[str, dict[date, Decimal]],
    open_days: list[date],
) -> list[str]:
    """Upload-priced holdings whose prices miss a trade, or more than
    ``UPLOADED_PRICES_MAX_MISSING_DAYS`` of the latest market days."""
    ledger = replay(transactions, [])
    first_trade: dict[str, date] = {}
    for txn in transactions:
        first_trade.setdefault(txn.ticker, txn.date)

    outdated = []
    for ticker, position in sorted(ledger.positions.items()):
        if not uses_uploaded_prices(ticker):
            continue
        days = closes.get(ticker, {})
        if not days or min(days) > first_trade[ticker]:
            outdated.append(ticker)
        elif position.quantity > 0:
            last_price = max(days)
            missing = sum(1 for day in open_days if day > last_price)
            if missing > UPLOADED_PRICES_MAX_MISSING_DAYS:
                outdated.append(ticker)
    return outdated


# ------------------------------------------------------------------
# Rights issues (bedelli sermaye artırımı)
# ------------------------------------------------------------------

MAX_RIGHTS_RATIO = Decimal(20)


class InvalidRightsIssue(ValueError):
    """Rejected rights-issue input; the message is safe to show."""


def list_rights_issues(db: Session, portfolio_id: int) -> list[dict]:
    """Rights issues of the portfolio's tickers, with what the portfolio
    was entitled to on each ex-date."""
    transactions = _load_ledger_transactions(db, portfolio_id)
    tickers = sorted({t.ticker for t in transactions})
    return _rights_summary(transactions, load_rights_issues(db, tickers))


def add_rights_issue(
    db: Session,
    portfolio_id: int,
    ticker: str,
    ex_date: date,
    ratio: Decimal,
    subscription_price: Decimal,
) -> dict:
    """Record a rights issue from its KAP terms for a ticker of the portfolio.

    The issue is shared by every portfolio holding the ticker, so input is
    restricted to the caller's own tickers and sane terms.
    """
    transactions = _load_ledger_transactions(db, portfolio_id)
    if ticker not in {t.ticker for t in transactions}:
        raise InvalidRightsIssue("ticker_not_in_portfolio")
    if ex_date > date.today():
        raise InvalidRightsIssue("ex_date_in_future")
    if not (0 < ratio <= MAX_RIGHTS_RATIO) or subscription_price < 0:
        raise InvalidRightsIssue("invalid_terms")
    held = replay([t for t in transactions if t.date < ex_date], []).positions.get(ticker)
    if held is None or held.quantity <= 0:
        raise InvalidRightsIssue("not_held_on_ex_date")

    yesterday = date.today() - timedelta(days=1)
    ensure_market_data(db, {ticker: (ex_date - timedelta(days=30), yesterday)})
    save_rights_issue(db, ticker, ex_date, ratio, subscription_price)
    return next(
        r for r in list_rights_issues(db, portfolio_id)
        if r["ticker"] == ticker and r["ex_date"] == ex_date.isoformat()
    )


def remove_rights_issue(db: Session, portfolio_id: int, ticker: str, ex_date: date) -> bool:
    transactions = _load_ledger_transactions(db, portfolio_id)
    if ticker not in {t.ticker for t in transactions}:
        raise InvalidRightsIssue("ticker_not_in_portfolio")
    return delete_rights_issue(db, ticker, ex_date)


def _rights_summary(
    transactions: list[LedgerTransaction],
    issues: dict[str, list[RightsIssue]],
) -> list[dict]:
    """Issues the portfolio held shares for, newest first."""
    summary: list[dict] = []
    for ticker, ticker_issues in issues.items():
        for issue in ticker_issues:
            held = replay([t for t in transactions if t.date < issue.ex_date], [])
            position = held.positions.get(ticker)
            entitled = position.quantity if position else Decimal(0)
            if entitled <= 0:
                continue
            rights = entitled * issue.ratio if issue.ratio is not None else None
            summary.append({
                "ticker": ticker,
                "ex_date": issue.ex_date.isoformat(),
                "ratio": float(issue.ratio) if issue.ratio is not None else None,
                "subscription_price": (
                    float(issue.subscription_price)
                    if issue.subscription_price is not None
                    else None
                ),
                "price_factor": float(issue.price_factor),
                "source": issue.source,
                "needs_review": issue.needs_review or issue.ratio is None,
                "entitled_shares": float(entitled),
                "rights": float(rights) if rights is not None else None,
            })
    summary.sort(key=lambda r: (r["ex_date"], r["ticker"]), reverse=True)
    return summary


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
    if uses_uploaded_prices(ticker):  # funds never split
        return _quantize_quantity(quantity), _quantize_price(price), Decimal(1)

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

# How far before the first trade comparison lines are loaded from.
COMPARISON_LOOKBACK = timedelta(days=10)


def _sales_in_closing_basis(
    positions: list[dict], actions: dict, today: date
) -> None:
    """Show a closed position's sales as the broker did: transactions are in
    today's split basis, so undo the splits after the position closed."""
    for row in positions:
        if row["quantity"] > 0 or not row["closed_on"]:
            continue
        factor = float(
            split_factor_between_dates(
                actions[row["ticker"]].splits, date.fromisoformat(row["closed_on"]), today
            )
        )
        if factor in (0, 1):
            continue
        row["sold_quantity"] /= factor
        for key in ("avg_sold_cost", "avg_sell_price"):
            if row[key] is not None:
                row[key] *= factor


def _market_data_needs(
    transactions: list[LedgerTransaction],
    comparison_tickers: list[str],
    through: date,
) -> dict[str, tuple[date, date]]:
    """Date window each ticker must cover: open positions through ``through``
    (the last settled day),
    fully closed ones only through their last trade; comparison lines from
    a little before the first trade."""
    ledger = replay(transactions, [])
    needs: dict[str, tuple[date, date]] = {}
    for txn in transactions:
        start, end = needs.get(txn.ticker, (txn.date, txn.date))
        needs[txn.ticker] = (min(start, txn.date), max(end, txn.date))

    for ticker, (start, end) in needs.items():
        if ledger.positions[ticker].quantity > 0:
            needs[ticker] = (start, through)

    for ticker in comparison_tickers:
        needs[ticker] = (transactions[0].date - COMPARISON_LOOKBACK, through)
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
        return sorted(d for d in benchmark_closes if start <= d <= end)

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
                COALESCE(adjusted_price, price),
                commission_rate
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
            operation=_operation(operation),
            quantity=Decimal(str(quantity)),
            price=Decimal(str(price)),
            commission_rate=Decimal(str(commission_rate)),
        )
        for txn_date, ticker, operation, quantity, price, commission_rate in rows
    ]


def _operation(value: str) -> str:
    value = value.lower()
    return value if value in ("buy", "rights_sale") else "sell"


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
