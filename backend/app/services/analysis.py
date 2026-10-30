"""
Portfolio analysis from already-loaded data. Pure: no DB, no network.

Everything is derived from one ledger replay (``app.services.ledger``),
so the metric cards, the tables and every point of the daily series use
identical math.

Daily series — one point per market open day, valued at that day's close
(the latest earlier close if a ticker did not trade):
  market_value    open positions at close (at cost if no close is known)
  cash            the safe: sale proceeds + net dividends not yet reinvested
  invested        the pocket: cumulative money brought in from outside
  total_value     market_value + cash
  realized_pl / unrealized_pl / dividend_income / total_pl   cumulative, TL
  pl_pct          total_pl / invested — "how far up was I on that day?"
  twr_pct         cumulative time-weighted return — performance with the
                  effect of new money removed; use it for drawdowns and
                  period returns.
  benchmark_close market benchmark (e.g. XU100) close,
  usd_close       USD/TRY,
  gold_close      gram gold in TRY — comparison lines, each carried
                  forward; null until its first known close.

TWR uses flows at the start of the day: each day's growth factor is
``total_value / (previous total_value + new money)``.
"""

from datetime import date, timedelta
from decimal import Decimal

from app.services.ledger import (
    DividendEvent,
    Ledger,
    LedgerTransaction,
    TickerPosition,
    group_by_date,
    replay,
)

ZERO = Decimal(0)
# Comparison series a point always carries as ``<key>_close``.
COMPARISONS = ("benchmark", "usd", "gold")
GRAMS_PER_TROY_OUNCE = Decimal("31.1034768")


def build_analysis(
    transactions: list[LedgerTransaction],
    closes: dict[str, dict[date, Decimal]],
    dividends: list[DividendEvent],
    open_days: list[date],
    as_of: date,
    comparison_closes: dict[str, dict[date, Decimal]] | None = None,
) -> dict:
    """Totals, tables and the daily series as of ``as_of`` (yesterday).

    ``dividends`` must already be limited to ex-dates ≤ ``as_of``: a
    dividend going ex today is not credited because today's price drop
    is not in the valuation either.
    """
    ledger = replay(transactions, dividends)
    latest_closes = {
        ticker: by_date[max(d for d in by_date if d <= as_of)]
        for ticker, by_date in closes.items()
        if any(d <= as_of for d in by_date)
    }

    market_value_total = ledger.market_value(latest_closes)
    positions = [
        _position_row(ticker, ledger.positions[ticker], latest_closes.get(ticker), market_value_total)
        for ticker in sorted(ledger.positions)
    ]
    # Open positions first, biggest first; then closed ones by result.
    positions.sort(key=lambda p: (p["quantity"] <= 0, -p["market_value"], -p["total_pl"]))

    realized = ledger.realized_total
    unrealized = ledger.unrealized_total(latest_closes)
    dividend_income = ledger.dividend_total
    total_pl = realized + unrealized + dividend_income

    totals = {
        "total_invested": _tl(ledger.pocket),
        "portfolio_value": _tl(market_value_total),
        "in_the_safe": _tl(ledger.safe),
        "realized_pl": _tl(realized),
        "unrealized_pl": _tl(unrealized),
        "dividend_income": _tl(dividend_income),
        "commission_paid": _tl(ledger.commission_total),
        "total_pl": _tl(total_pl),
        "total_pl_pct": _pct(total_pl, ledger.pocket, 2),
    }

    return {
        "positions": positions,
        "dividends": _dividends_payload(ledger),
        "totals": totals,
        "performance_series": build_daily_series(
            transactions, closes, dividends, open_days, as_of, comparison_closes
        ),
    }


def build_daily_series(
    transactions: list[LedgerTransaction],
    closes: dict[str, dict[date, Decimal]],
    dividends: list[DividendEvent],
    open_days: list[date],
    as_of: date,
    comparison_closes: dict[str, dict[date, Decimal]] | None = None,
) -> dict:
    """Daily series from the first buy through ``as_of`` (see module doc).

    ``comparison_closes`` maps a key of ``COMPARISONS`` to its closes.
    """
    first_buy = next((t.date for t in transactions if t.operation == "buy"), None)
    if first_buy is None:
        return {"start_date": None, "end_date": None, "points": []}
    if first_buy > as_of:
        return {
            "start_date": first_buy.isoformat(),
            "end_date": as_of.isoformat(),
            "points": [],
        }

    events = group_by_date((t for t in transactions if t.date <= as_of), dividends)
    prices_by_date: dict[date, list[tuple[str, Decimal]]] = {}
    for ticker, by_date in closes.items():
        for price_date, close in by_date.items():
            prices_by_date.setdefault(price_date, []).append((ticker, close))
    open_set = set(open_days)

    comparison_closes = comparison_closes or {}
    ledger = Ledger()
    latest_closes: dict[str, Decimal] = {}
    comparison: dict[str, Decimal | None] = dict.fromkeys(COMPARISONS)

    # Events before the first buy (e.g. stray sells) still move the cash.
    for day in sorted(d for d in events if d < first_buy):
        ledger.apply_day(*events[day])
    for day in sorted(d for d in prices_by_date if d < first_buy):
        latest_closes.update(prices_by_date[day])
    for key, by_date in comparison_closes.items():
        earlier = [d for d in by_date if d < first_buy]
        if earlier:
            comparison[key] = by_date[max(earlier)]

    twr_factor = Decimal(1)
    prev_value = ZERO
    prev_invested = ledger.pocket
    points: list[dict] = []

    day = first_buy
    while day <= as_of:
        if day in events:
            ledger.apply_day(*events[day])
        latest_closes.update(prices_by_date.get(day, []))
        for key, by_date in comparison_closes.items():
            comparison[key] = by_date.get(day, comparison[key])

        if day in open_set:
            market_value = ledger.market_value(latest_closes)
            total_value = market_value + ledger.safe
            invested = ledger.pocket

            start_value = prev_value + (invested - prev_invested)
            if start_value > 0:
                twr_factor *= total_value / start_value
            prev_value, prev_invested = total_value, invested

            realized = ledger.realized_total
            unrealized = ledger.unrealized_total(latest_closes)
            dividend_income = ledger.dividend_total
            total_pl = realized + unrealized + dividend_income

            points.append({
                "date": day.isoformat(),
                "market_value": _tl(market_value),
                "cash": _tl(ledger.safe),
                "invested": _tl(invested),
                "total_value": _tl(total_value),
                "realized_pl": _tl(realized),
                "unrealized_pl": _tl(unrealized),
                "dividend_income": _tl(dividend_income),
                "total_pl": _tl(total_pl),
                "pl_pct": _pct(total_pl, invested, 4),
                "twr_pct": round(float((twr_factor - 1) * 100), 4),
                **{
                    f"{key}_close": float(close) if close is not None else None
                    for key, close in comparison.items()
                },
            })

        day += timedelta(days=1)

    return {
        "start_date": first_buy.isoformat(),
        "end_date": as_of.isoformat(),
        "points": points,
    }


def gram_gold_try(
    gold_usd_per_ounce: dict[date, Decimal], usd_try: dict[date, Decimal]
) -> dict[date, Decimal]:
    """Gram gold in TRY: ounce price in USD × USD/TRY (that day's or the
    latest earlier rate) ÷ grams per troy ounce."""
    result: dict[date, Decimal] = {}
    rate: Decimal | None = None
    rate_days = sorted(usd_try)
    i = 0
    for day in sorted(gold_usd_per_ounce):
        while i < len(rate_days) and rate_days[i] <= day:
            rate = usd_try[rate_days[i]]
            i += 1
        if rate is not None:
            result[day] = gold_usd_per_ounce[day] * rate / GRAMS_PER_TROY_OUNCE
    return result


def _position_row(
    ticker: str,
    position: TickerPosition,
    price: Decimal | None,
    market_value_total: Decimal,
) -> dict:
    """One row of the per-stock P/L table.

    total_pl = unrealized + realized (incl. sold rights) + net dividends;
    total_pl_pct is measured against everything ever paid for the ticker.
    """
    held = position.quantity > 0
    if held and price is not None:
        market_value = position.quantity * price
        unrealized = market_value - position.cost_basis
    else:
        market_value = position.cost_basis if held else ZERO
        unrealized = ZERO
    total_pl = unrealized + position.realized_pl + position.dividend_income

    return {
        "ticker": ticker,
        "quantity": float(position.quantity),
        "avg_cost": float(position.avg_cost),
        "price": float(price) if price is not None else None,
        "market_value": _tl(market_value),
        "cost_basis": _tl(position.cost_basis),
        "weight_pct": _pct(market_value, market_value_total, 2),
        "unrealized_pl": _tl(unrealized),
        "unrealized_pl_pct": _pct(unrealized, position.cost_basis, 2),
        "realized_pl": _tl(position.realized_pl),
        "dividend_income": _tl(position.dividend_income),
        "commission_paid": _tl(position.commission_paid),
        "invested": _tl(position.bought_cost),
        "total_pl": _tl(total_pl),
        "total_pl_pct": _pct(total_pl, position.bought_cost, 2),
    }


def _dividends_payload(ledger: Ledger) -> dict:
    receipts = sorted(
        ledger.dividend_receipts, key=lambda r: (r.ex_date, r.ticker), reverse=True
    )
    return {
        "total_gross": _tl(sum((r.gross_amount for r in receipts), ZERO)),
        "total_net": _tl(sum((r.net_amount for r in receipts), ZERO)),
        "receipts": [
            {
                "ex_date": r.ex_date.isoformat(),
                "ticker": r.ticker,
                "quantity": float(r.quantity),
                "gross_per_share": float(r.gross_per_share),
                "withholding_rate": float(r.withholding_rate),
                "gross_amount": _tl(r.gross_amount),
                "net_amount": _tl(r.net_amount),
            }
            for r in receipts
        ],
    }


def _tl(value: Decimal) -> float:
    return round(float(value), 2)


def _pct(part: Decimal, whole: Decimal, digits: int) -> float:
    return round(float(part / whole * 100), digits) if whole > 0 else 0.0
