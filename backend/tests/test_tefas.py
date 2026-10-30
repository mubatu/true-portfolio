"""TEFAS 'Fon Verileri' Excel export parsing and fund price freshness."""

from datetime import date, datetime
from decimal import Decimal as D
from io import BytesIO

import pytest
from openpyxl import Workbook

from app.core.markets import uses_uploaded_prices
from app.services.ledger import LedgerTransaction
from app.services.portfolio_service import _outdated_uploaded_prices
from app.services.tefas import InvalidFundPrices, normalize_fund_code, parse_price_export


def export(rows: list[tuple]) -> bytes:
    """Workbook shaped like TEFAS's export, with ``rows`` under the header."""
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Tablo Verisi"
    for row in [
        ("Rapor Bilgileri", None),
        ("Dışa Aktarım Tarihi:", "30.10.2026 15:19:13"),
        ("Toplam Kayıt Sayısı:", len(rows)),
        (None, None),
        ("Tarih", "Fiyat"),
        *rows,
    ]:
        sheet.append(row)
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def test_parses_prices_in_any_order_and_drops_zeros():
    prices = parse_price_export(export([
        (datetime(2026, 10, 30), 0.685961),
        (datetime(2026, 10, 28), 0.685244),
        (datetime(2021, 10, 29), 0),  # before the fund existed
    ]))
    assert prices == {date(2026, 10, 30): D("0.685961"), date(2026, 10, 28): D("0.685244")}


def test_parses_text_cells():
    prices = parse_price_export(export([("28.10.2026", "1.234,567890")]))
    assert prices == {date(2026, 10, 28): D("1234.567890")}


@pytest.mark.parametrize(
    ("content", "code"),
    [
        (b"not a workbook", "not_excel"),
        (export([]), "no_prices"),
        (export([(datetime(2026, 10, 28), 0)]), "no_prices"),
    ],
)
def test_rejects_unusable_files(content, code):
    with pytest.raises(InvalidFundPrices, match=code):
        parse_price_export(content)


def test_rejects_sheet_without_price_table():
    workbook = Workbook()
    workbook.active.append(("Hisse", "Kapanış"))
    buffer = BytesIO()
    workbook.save(buffer)
    with pytest.raises(InvalidFundPrices, match="no_price_table"):
        parse_price_export(buffer.getvalue())


def test_fund_code_is_three_characters():
    assert normalize_fund_code(" ipb ") == "IPB"
    with pytest.raises(InvalidFundPrices, match="invalid_fund_code"):
        normalize_fund_code("THYAO")


def test_only_fund_tickers_use_uploaded_prices():
    assert uses_uploaded_prices("IPB.TEFAS")
    assert not uses_uploaded_prices("THYAO.IS")
    assert not uses_uploaded_prices("XU100.IS")


def test_outdated_fund_prices_are_flagged():
    # Market days: Mon 26 – Wed 28 Oct, then Fri 30 Oct (29th is a holiday).
    open_days = [date(2026, 10, 26), date(2026, 10, 27), date(2026, 10, 28), date(2026, 10, 30)]
    buy = LedgerTransaction(date(2026, 1, 5), "IPB.TEFAS", "buy", D(100), D("0.5"))
    stock = LedgerTransaction(date(2026, 1, 5), "THYAO.IS", "buy", D(1), D(300))

    def prices_through(last: date) -> dict[str, dict[date, D]]:
        return {"IPB.TEFAS": {date(2026, 1, 5): D("0.5"), last: D("0.68")}}

    assert _outdated_uploaded_prices([buy, stock], prices_through(date(2026, 10, 30)), open_days) == []
    # Two market days without a price (28 and 30 Oct) are tolerated...
    assert _outdated_uploaded_prices([buy], prices_through(date(2026, 10, 27)), open_days) == []
    # ...a third is not.
    assert _outdated_uploaded_prices([buy], prices_through(date(2026, 10, 26)), open_days) == ["IPB.TEFAS"]
    # Nothing uploaded, or prices that start after the purchase.
    assert _outdated_uploaded_prices([buy], {}, open_days) == ["IPB.TEFAS"]
    late = {"IPB.TEFAS": {date(2026, 3, 2): D("0.55"), date(2026, 10, 30): D("0.68")}}
    assert _outdated_uploaded_prices([buy], late, open_days) == ["IPB.TEFAS"]
