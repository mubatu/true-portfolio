from datetime import date, timedelta
from decimal import Decimal as D

from app.services.analysis import build_analysis, build_daily_series, gram_gold_try
from app.services.ledger import DividendEvent, LedgerTransaction

D1, D2, D3, D4 = (date(2025, 3, 3) + timedelta(days=n) for n in range(4))


def buy(day, ticker, qty, price):
    return LedgerTransaction(day, ticker, "buy", D(qty), D(price))


def sell(day, ticker, qty, price):
    return LedgerTransaction(day, ticker, "sell", D(qty), D(price))


def closes(ticker, *pairs):
    return {ticker: {day: D(str(close)) for day, close in pairs}}


def test_new_money_does_not_look_like_a_market_move():
    """Regression for the old base-100 chart (see PROJECT_STATUS.md).

    Day 1: buy 1 @ 100, close 110. Day 2: close 110.
    Day 3: buy 9 more @ 110, close 110. Prices never move after day 1.
    """
    series = build_daily_series(
        [buy(D1, "AAA.IS", "1", "100"), buy(D3, "AAA.IS", "9", "110")],
        closes("AAA.IS", (D1, 110), (D2, 110), (D3, 110)),
        [],
        [D1, D2, D3],
        as_of=D3,
    )
    p1, p2, p3 = series["points"]

    # First day shows its real result instead of a forced 0%.
    assert p1["pl_pct"] == 10.0
    assert p1["total_pl"] == 10.0

    # Adding money dilutes "P/L vs invested"...
    assert p3["invested"] == 1090.0
    assert p3["total_value"] == 1100.0
    assert p3["pl_pct"] == round(10 / 1090 * 100, 4)

    # ...but performance (TWR) is unchanged: the market did not move.
    assert p1["twr_pct"] == p2["twr_pct"] == p3["twr_pct"] == 10.0


def test_twr_compounds_market_moves_only():
    series = build_daily_series(
        [buy(D1, "AAA.IS", "10", "100"), buy(D3, "AAA.IS", "10", "120")],
        closes("AAA.IS", (D1, 100), (D2, 120), (D3, 120), (D4, 60)),
        [],
        [D1, D2, D3, D4],
        as_of=D4,
    )
    twr = [p["twr_pct"] for p in series["points"]]
    # +20%, flat, flat (buy at close), then −50% → 1.2 × 0.5 = 0.6
    assert twr == [0.0, 20.0, 20.0, -40.0]


def test_series_matches_totals_and_value_identity():
    txns = [
        buy(D1, "AAA.IS", "10", "100"),
        buy(D1, "BBB.IS", "5", "40"),
        sell(D3, "AAA.IS", "4", "115"),
        buy(D4, "BBB.IS", "5", "38"),
    ]
    prices = {
        **closes("AAA.IS", (D1, 101), (D2, 108), (D3, 116), (D4, 112)),
        **closes("BBB.IS", (D1, 41), (D2, 39), (D4, 37)),  # no trade on D3
    }
    divs = [DividendEvent(D2, "BBB.IS", D("2"), D("0.15"))]

    result = build_analysis(txns, prices, divs, [D1, D2, D3, D4], as_of=D4)
    totals = result["totals"]
    last = result["performance_series"]["points"][-1]

    assert last["total_pl"] == totals["total_pl"]
    assert round(last["pl_pct"], 2) == totals["total_pl_pct"]
    assert last["cash"] == totals["in_the_safe"]
    assert last["market_value"] == totals["portfolio_value"]
    for point in result["performance_series"]["points"]:
        assert round(point["total_value"] - point["invested"], 2) == point["total_pl"]

    # D3 has no BBB close → carried forward from D2, not dropped.
    d3 = result["performance_series"]["points"][2]
    assert d3["market_value"] == 6 * 116 + 5 * 39


def test_only_open_days_are_plotted_but_weekend_trades_count():
    saturday = date(2025, 3, 8)
    monday = date(2025, 3, 10)
    series = build_daily_series(
        [buy(D1, "AAA.IS", "1", "100"), buy(saturday, "AAA.IS", "1", "100")],
        closes("AAA.IS", (D1, 100), (monday, 100)),
        [],
        [D1, monday],
        as_of=monday,
    )
    assert [p["date"] for p in series["points"]] == [D1.isoformat(), monday.isoformat()]
    assert series["points"][-1]["invested"] == 200.0


def test_empty_portfolio():
    result = build_analysis([], {}, [], [], as_of=D4)
    assert result["positions"] == []
    assert result["totals"]["total_pl"] == 0
    assert result["performance_series"]["points"] == []


def test_holding_without_any_close_is_valued_at_cost():
    result = build_analysis(
        [buy(D1, "NEW.IS", "10", "50")], {}, [], [D1], as_of=D1
    )
    (holding,) = result["positions"]
    assert holding["price"] is None
    assert holding["market_value"] == 500.0
    assert result["totals"]["total_pl"] == 0
    assert result["performance_series"]["points"][0]["total_value"] == 500.0


def test_benchmark_close_is_carried_forward():
    series = build_daily_series(
        [buy(D1, "AAA.IS", "1", "100")],
        closes("AAA.IS", (D1, 100), (D2, 101), (D3, 102)),
        [],
        [D1, D2, D3],
        as_of=D3,
        comparison_closes={"benchmark": {D1: D("9000"), D3: D("9100")}},  # D2 missing
    )
    assert [p["benchmark_close"] for p in series["points"]] == [9000.0, 9000.0, 9100.0]


def test_benchmark_is_optional():
    series = build_daily_series(
        [buy(D1, "AAA.IS", "1", "100")], closes("AAA.IS", (D1, 100)), [], [D1], as_of=D1
    )
    assert series["points"][0]["benchmark_close"] is None
    assert series["points"][0]["usd_close"] is None
    assert series["points"][0]["gold_close"] is None


def test_gold_and_dollar_lines_ride_along():
    series = build_daily_series(
        [buy(D2, "AAA.IS", "1", "100")],
        closes("AAA.IS", (D2, 100), (D3, 101)),
        [],
        [D2, D3],
        as_of=D3,
        # Known before the first buy: the line starts from that close.
        comparison_closes={"usd": {D1: D("40"), D3: D("41")}, "gold": {D2: D("5000")}},
    )
    assert [p["usd_close"] for p in series["points"]] == [40.0, 41.0]
    assert [p["gold_close"] for p in series["points"]] == [5000.0, 5000.0]


def test_gram_gold_uses_the_latest_known_rate():
    gold = gram_gold_try(
        {D1: D("3110.34768"), D2: D("3110.34768"), D3: D("3110.34768")},
        {D1: D("40"), D3: D("42")},  # no rate on D2
    )
    assert gold == {D1: D("4000"), D2: D("4000"), D3: D("4200")}
    assert gram_gold_try({D1: D("3000")}, {D2: D("40")}) == {}  # no rate yet


def test_commission_keeps_value_identity_and_is_reported():
    rate = D("0.0002")
    txns = [
        LedgerTransaction(D1, "AAA.IS", "buy", D(100), D(50), rate),
        LedgerTransaction(D3, "AAA.IS", "sell", D(40), D(55), rate),
    ]
    result = build_analysis(
        txns, closes("AAA.IS", (D1, 50), (D2, 52), (D3, 55)), [], [D1, D2, D3], as_of=D3
    )
    # Day 1: bought at the close, so the only loss is the 1 TL commission.
    assert result["performance_series"]["points"][0]["total_pl"] == -1.0
    for point in result["performance_series"]["points"]:
        assert round(point["total_value"] - point["invested"], 2) == point["total_pl"]
    assert result["totals"]["commission_paid"] == round(1 + 40 * 55 * 0.0002, 2)


def test_positions_split_realized_unrealized_and_add_up_to_totals():
    txns = [
        buy(D1, "AAA.IS", "10", "100"),
        sell(D3, "AAA.IS", "4", "115"),
        buy(D1, "BBB.IS", "5", "40"),
        sell(D2, "BBB.IS", "5", "44"),  # fully closed
    ]
    prices = {
        **closes("AAA.IS", (D1, 100), (D2, 108), (D3, 116), (D4, 120)),
        **closes("BBB.IS", (D1, 40), (D2, 44)),
    }
    divs = [DividendEvent(D2, "AAA.IS", D("2"), D("0"))]
    result = build_analysis(txns, prices, divs, [D1, D2, D3, D4], as_of=D4)
    rows = {p["ticker"]: p for p in result["positions"]}

    aaa = rows["AAA.IS"]
    assert aaa["quantity"] == 6
    assert aaa["unrealized_pl"] == 6 * (120 - 100)
    assert aaa["realized_pl"] == 4 * (115 - 100)
    assert aaa["dividend_income"] == 20
    assert aaa["total_pl"] == 120 + 60 + 20
    assert aaa["total_pl_pct"] == 20.0  # 200 / 1000 invested
    assert aaa["weight_pct"] == 100.0

    bbb = rows["BBB.IS"]
    assert bbb["quantity"] == 0 and bbb["market_value"] == 0
    assert bbb["realized_pl"] == 20 and bbb["unrealized_pl"] == 0

    # Open positions come first.
    assert [p["ticker"] for p in result["positions"]] == ["AAA.IS", "BBB.IS"]
    assert round(sum(p["total_pl"] for p in result["positions"]), 2) == result["totals"]["total_pl"]


def test_closed_position_row_shows_its_sales():
    result = build_analysis(
        [buy(D1, "AAA.IS", "10", "100"), sell(D2, "AAA.IS", "4", "120"), sell(D3, "AAA.IS", "6", "130")],
        closes("AAA.IS", (D1, 100), (D2, 120), (D3, 130)),
        [],
        [D1, D2, D3],
        as_of=D3,
    )
    row = result["positions"][0]
    assert row["quantity"] == 0
    assert row["sold_quantity"] == 10
    assert row["avg_sold_cost"] == 100
    assert row["avg_sell_price"] == 126
    assert row["closed_on"] == D3.isoformat()


def test_closed_sales_are_shown_in_the_basis_of_their_close():
    """Sold 512 lots at 59.80 before a 1.83 split: show 512 × 59.80, not 937 × 32.67."""
    from app.services.market_data import CorporateActions
    from app.services.portfolio_service import _sales_in_closing_basis

    split = D("1.8306711")
    rows = [
        {
            "ticker": "TNZTP.IS",
            "quantity": 0.0,
            "closed_on": "2025-08-19",
            "sold_quantity": float(512 * split),
            "avg_sold_cost": float(D("37.81") / split),
            "avg_sell_price": float(D("59.80") / split),
        },
        {"ticker": "AAA.IS", "quantity": 5.0, "closed_on": None, "sold_quantity": 0.0},
    ]
    actions = {"TNZTP.IS": CorporateActions(splits=((date(2025, 9, 11), split),)), "AAA.IS": CorporateActions()}
    _sales_in_closing_basis(rows, actions, date(2026, 10, 30))
    assert round(rows[0]["sold_quantity"], 6) == 512
    assert round(rows[0]["avg_sell_price"], 6) == 59.80
    assert round(rows[0]["avg_sold_cost"], 6) == 37.81
    assert rows[1]["sold_quantity"] == 0.0
