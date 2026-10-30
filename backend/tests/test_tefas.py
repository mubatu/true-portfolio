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
    yesterday = date(2026, 10, 29)
    buy = LedgerTransaction(date(2026, 1, 5), "IPB.TEFAS", "buy", D(100), D("0.5"))
    stock = LedgerTransaction(date(2026, 1, 5), "THYAO.IS", "buy", D(1), D(300))
    fresh = {date(2026, 1, 5): D("0.5"), date(2026, 10, 28): D("0.68")}

    assert _outdated_uploaded_prices([buy, stock], {"IPB.TEFAS": fresh}, yesterday) == []
    # Nothing uploaded, or prices that start after the purchase.
    assert _outdated_uploaded_prices([buy], {}, yesterday) == ["IPB.TEFAS"]
    late = {date(2026, 3, 2): D("0.55"), date(2026, 10, 28): D("0.68")}
    assert _outdated_uploaded_prices([buy], {"IPB.TEFAS": late}, yesterday) == ["IPB.TEFAS"]
    # Last upload weeks ago while the fund is still held.
    stale = {date(2026, 1, 5): D("0.5"), date(2026, 9, 30): D("0.66")}
    assert _outdated_uploaded_prices([buy], {"IPB.TEFAS": stale}, yesterday) == ["IPB.TEFAS"]
