from datetime import date, timedelta

from app.services.explore import (
    detail,
    owner_label,
    period_return,
    public_allocation,
    shift_months,
    summary,
)

ROW = {
    "id": 9,
    "slug": "abc123",
    "name": "Buber Fon",
    "market": "BIST",
    "is_experimental": False,
    "full_name": "Batuhan Buber",
}

# Keys that carry money, quantities or identity anywhere in the analysis.
PRIVATE_KEYS = {
    "market_value", "cash", "invested", "total_value", "realized_pl", "unrealized_pl",
    "dividend_income", "total_pl", "pl_pct", "quantity", "avg_cost", "price", "cost_basis",
    "total_invested", "portfolio_value", "in_the_safe", "commission_paid", "receipts",
    "user_id", "email", "full_name", "id", "portfolio_id", "dividends", "totals",
}


def point(day: date, twr: float) -> dict:
    return {
        "date": day.isoformat(),
        "market_value": 9000.0,
        "cash": 1000.0,
        "invested": 8000.0,
        "total_value": 10000.0,
        "realized_pl": 500.0,
        "unrealized_pl": 1500.0,
        "dividend_income": 0.0,
        "total_pl": 2000.0,
        "pl_pct": 25.0,
        "twr_pct": twr,
        "benchmark_close": 9000.0,
        "usd_close": 41.0,
        "gold_close": 5000.0,
    }


def position(ticker: str, quantity: float, value: float) -> dict:
    return {"ticker": ticker, "quantity": quantity, "market_value": value, "avg_cost": 10.0, "total_pl": 5.0}


def analysis(points: list[dict]) -> dict:
    return {
        "portfolio_id": 9,
        "performance_series": {"points": points},
        "positions": [position("AAA.IS", 100, 6000), position("BBB.IS", 50, 3000), position("CCC.IS", 0, 0)],
        "totals": {"portfolio_value": 9000.0, "in_the_safe": 1000.0, "total_invested": 8000.0},
        "dividends": {"receipts": [{"net_amount": 12.0}]},
    }


def walk_keys(value):
    if isinstance(value, dict):
        for k, v in value.items():
            yield k
            yield from walk_keys(v)
    elif isinstance(value, list):
        for v in value:
            yield from walk_keys(v)


def test_public_output_has_no_amounts_or_identity():
    days = [date(2025, 1, 1) + timedelta(days=n) for n in range(400)]
    a = analysis([point(d, n / 10) for n, d in enumerate(days)])
    for output in (summary(ROW, a), detail(ROW, a)):
        leaked = set(walk_keys(output)) & PRIVATE_KEYS
        assert not leaked, leaked
        assert "Buber" not in str(output["owner"])


def test_allocation_is_percentages_of_value_with_cash():
    alloc = public_allocation(analysis([]))
    assert alloc == {
        "positions": [{"ticker": "AAA.IS", "weight_pct": 60.0}, {"ticker": "BBB.IS", "weight_pct": 30.0}],
        "cash_pct": 10.0,
    }


def test_owner_label_shortens_the_name():
    assert owner_label("Batuhan Buber") == {"display_name": "Batuhan B.", "initials": "BB"}
    assert owner_label("ilker Mehmet ışık") == {"display_name": "ilker I.", "initials": "İI"}
    assert owner_label("Cher") == {"display_name": "Cher", "initials": "C"}
    assert owner_label("  ") == {"display_name": None, "initials": None}
    assert owner_label(None) == {"display_name": None, "initials": None}


def test_shift_months_clamps_to_month_end():
    assert shift_months(date(2026, 3, 31), -1) == date(2026, 2, 28)
    assert shift_months(date(2026, 1, 15), -12) == date(2025, 1, 15)


def test_period_return_uses_the_close_on_or_before_the_start():
    pts = [
        {"date": "2026-01-30", "twr_pct": 0.0},
        {"date": "2026-02-27", "twr_pct": 10.0},  # last close before 2026-02-28
        {"date": "2026-03-31", "twr_pct": 21.0},
    ]
    assert period_return(pts, 1) == 10.0  # 1.21 / 1.10
    assert period_return(pts, 12) is None  # history is shorter than a year
    assert period_return([], 1) is None
