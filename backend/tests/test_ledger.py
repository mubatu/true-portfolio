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

def test_sales_are_summarized_and_close_date_kept():
    ledger = replay(
        [
            buy(date(2025, 1, 2), "AAA.IS", "10", "100"),
            sell(date(2025, 1, 6), "AAA.IS", "4", "120"),
            LedgerTransaction(date(2025, 1, 7), "AAA.IS", "rights_sale", D(5), D(2)),
            sell(date(2025, 1, 8), "AAA.IS", "6", "130"),
        ],
        [],
    )
    position = ledger.positions["AAA.IS"]
    assert position.sold_quantity == D(10)
    assert position.share_sales == D(1260)  # 4 × 120 + 6 × 130; sold rights excluded
    assert position.sold_cost == D(1000)
    assert position.closed_on == date(2025, 1, 8)


def test_buying_again_reopens_position():
    ledger = replay(
        [
            buy(date(2025, 1, 2), "AAA.IS", "10", "100"),
            sell(date(2025, 1, 6), "AAA.IS", "10", "120"),
            buy(date(2025, 2, 3), "AAA.IS", "5", "110"),
        ],
        [],
    )
    assert ledger.positions["AAA.IS"].closed_on is None


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


# -- commission -----------------------------------------------------------

RATE = D("0.0002")  # on binde 2


def test_buy_commission_is_part_of_cost_and_cash_paid():
    ledger = replay(
        [LedgerTransaction(date(2025, 1, 2), "AAA.IS", "buy", D(100), D(50), RATE)], []
    )
    position = ledger.positions["AAA.IS"]
    assert position.cost_basis == D("5001")  # 5000 + 1 TL commission
    assert position.avg_cost == D("50.01")
    assert ledger.pocket == D("5001")
    assert ledger.commission_total == D("1")


def test_sell_commission_reduces_proceeds_and_realized_pl():
    ledger = replay(
        [
            LedgerTransaction(date(2025, 1, 2), "AAA.IS", "buy", D(100), D(50), RATE),
            LedgerTransaction(date(2025, 2, 3), "AAA.IS", "sell", D(100), D(60), RATE),
        ],
        [],
    )
    position = ledger.positions["AAA.IS"]
    # proceeds 6000 − 1.2 = 5998.8; cost 5001 → realized 997.8
    assert position.sold_value == D("5998.8")
    assert position.realized_pl == D("997.8")
    assert ledger.safe == D("5998.8")
    assert ledger.commission_total == D("2.2")


def test_rights_sale_commission_reduces_proceeds():
    ledger = replay(
        [
            LedgerTransaction(date(2025, 1, 2), "AAA.IS", "buy", D(100), D(50)),
            LedgerTransaction(date(2025, 3, 3), "AAA.IS", "rights_sale", D(100), D(10), RATE),
        ],
        [],
    )
    assert ledger.positions["AAA.IS"].realized_pl == D("999.8")
    assert ledger.safe == D("999.8")


def test_zero_commission_matches_previous_behaviour():
    without = replay([buy(date(2025, 1, 2), "AAA.IS", "10", "100")], [])
    explicit = replay(
        [LedgerTransaction(date(2025, 1, 2), "AAA.IS", "buy", D(10), D(100), D(0))], []
    )
    assert without.positions == explicit.positions
    assert without.pocket == explicit.pocket == D(1000)
