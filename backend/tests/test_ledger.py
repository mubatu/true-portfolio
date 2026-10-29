from datetime import date
from decimal import Decimal as D

from app.services.ledger import (
    DividendEvent,
    Ledger,
    LedgerTransaction,
    replay,
)


def buy(day: date, ticker: str, qty: str, price: str) -> LedgerTransaction:
    return LedgerTransaction(day, ticker, "buy", D(qty), D(price))


def sell(day: date, ticker: str, qty: str, price: str) -> LedgerTransaction:
    return LedgerTransaction(day, ticker, "sell", D(qty), D(price))


def dividend(day: date, ticker: str, gross: str, rate: str = "0") -> DividendEvent:
    return DividendEvent(day, ticker, D(gross), D(rate))


# -- average cost & cash model (pre-existing behaviour) ----------------

def test_average_cost_and_realized_pl():
    ledger = replay(
        [
            buy(date(2025, 1, 2), "AAA.IS", "10", "100"),
            buy(date(2025, 1, 3), "AAA.IS", "10", "120"),
            sell(date(2025, 1, 6), "AAA.IS", "5", "130"),
        ],
        [],
    )
    position = ledger.positions["AAA.IS"]
    assert position.quantity == D(15)
    assert position.avg_cost == D(110)
    assert position.realized_pl == D(100)  # 5 × (130 − 110)
    assert position.sold_cost == D(550)
    assert ledger.pocket == D(2200)
    assert ledger.safe == D(650)


def test_sell_proceeds_fund_next_buy_before_pocket():
    ledger = replay(
        [
            buy(date(2025, 1, 2), "AAA.IS", "10", "100"),
            sell(date(2025, 1, 3), "AAA.IS", "10", "110"),
            buy(date(2025, 1, 6), "BBB.IS", "12", "100"),
        ],
        [],
    )
    # 1100 from the safe + 100 new money
    assert ledger.pocket == D(1100)
    assert ledger.safe == D(0)


def test_selling_everything_resets_position():
    ledger = replay(
        [
            buy(date(2025, 1, 2), "AAA.IS", "10", "100"),
            sell(date(2025, 1, 3), "AAA.IS", "10", "90"),
        ],
        [],
    )
    position = ledger.positions["AAA.IS"]
    assert position.quantity == 0
    assert position.cost_basis == 0
    assert position.realized_pl == D(-100)


# -- dividends -----------------------------------------------------------

def test_dividend_is_net_of_withholding_and_goes_to_safe():
    ledger = replay(
        [buy(date(2025, 1, 2), "AAA.IS", "100", "50")],
        [dividend(date(2025, 3, 10), "AAA.IS", "2", "0.15")],
    )
    (receipt,) = ledger.dividend_receipts
    assert receipt.quantity == D(100)
    assert receipt.gross_amount == D(200)
    assert receipt.net_amount == D(170)
    assert ledger.dividend_total == D(170)
    assert ledger.safe == D(170)
    assert ledger.pocket == D(5000)


def test_shares_bought_on_ex_date_do_not_receive_dividend():
    ex_date = date(2025, 3, 10)
    ledger = replay(
        [
            buy(date(2025, 3, 7), "AAA.IS", "10", "50"),
            buy(ex_date, "AAA.IS", "90", "48"),
        ],
        [dividend(ex_date, "AAA.IS", "2")],
    )
    assert ledger.dividend_receipts[0].quantity == D(10)
    assert ledger.dividend_total == D(20)


def test_shares_sold_on_ex_date_still_receive_dividend():
    ex_date = date(2025, 3, 10)
    ledger = replay(
        [
            buy(date(2025, 3, 7), "AAA.IS", "10", "50"),
            sell(ex_date, "AAA.IS", "10", "48"),
        ],
        [dividend(ex_date, "AAA.IS", "2")],
    )
    assert ledger.dividend_total == D(20)


def test_no_dividend_without_position():
    ledger = replay(
        [
            buy(date(2025, 1, 2), "AAA.IS", "10", "50"),
            sell(date(2025, 2, 3), "AAA.IS", "10", "55"),
        ],
        [
            dividend(date(2024, 12, 2), "AAA.IS", "2"),  # before first buy
            dividend(date(2025, 3, 10), "AAA.IS", "2"),  # after full exit
            dividend(date(2025, 1, 15), "BBB.IS", "2"),  # never held
        ],
    )
    assert ledger.dividend_receipts == []


def test_dividend_cash_funds_next_buy():
    ledger = replay(
        [
            buy(date(2025, 1, 2), "AAA.IS", "100", "10"),
            buy(date(2025, 4, 1), "BBB.IS", "10", "5"),
        ],
        [dividend(date(2025, 3, 10), "AAA.IS", "1")],
    )
    # 100 TL dividend lands in the safe; the 50 TL buy is paid from it.
    assert ledger.pocket == D(1000)
    assert ledger.safe == D(50)


def test_ex_date_price_drop_is_offset_by_dividend():
    """Total P/L is continuous across the ex-date (no fake loss)."""
    ledger = Ledger()
    ledger.apply_day([], [buy(date(2025, 3, 7), "AAA.IS", "100", "100")])
    before = ledger.realized_total + ledger.dividend_total + ledger.unrealized_total(
        {"AAA.IS": D(100)}
    )

    # Ex-date: price drops by exactly the gross dividend.
    ledger.apply_day([dividend(date(2025, 3, 10), "AAA.IS", "5")], [])
    after = ledger.realized_total + ledger.dividend_total + ledger.unrealized_total(
        {"AAA.IS": D(95)}
    )

    assert before == after == 0
