from datetime import date
from decimal import Decimal as D

import pandas as pd

from app.core.markets import get_dividend_withholding_rate
from app.services import corporate_actions
from app.services.corporate_actions import split_factor_between_dates
from app.services.portfolio_service import _prices_disagree


# -- withholding schedule -------------------------------------------------

def test_bist_withholding_schedule():
    rate = get_dividend_withholding_rate
    assert rate("BIST", date(2021, 12, 21)) == D("0.15")
    assert rate("BIST", date(2021, 12, 22)) == D("0.10")
    assert rate("BIST", date(2024, 12, 21)) == D("0.10")
    assert rate("BIST", date(2024, 12, 22)) == D("0.15")
    assert rate("bist", date(2026, 6, 1)) == D("0.15")


def test_unknown_market_has_no_withholding():
    assert get_dividend_withholding_rate(None, date(2025, 1, 1)) == 0
    assert get_dividend_withholding_rate("NYSE", date(2025, 1, 1)) == 0


# -- splits -------------------------------------------------------------

def test_split_factor_window_is_open_closed():
    splits = [(date(2023, 4, 4), D(7)), (date(2025, 1, 10), D(2))]
    assert split_factor_between_dates(splits, date(2023, 1, 1), date(2026, 1, 1)) == 14
    # A trade on the split date is already in the post-split basis.
    assert split_factor_between_dates(splits, date(2023, 4, 4), date(2026, 1, 1)) == 2
    assert split_factor_between_dates(splits, date(2025, 1, 10), date(2026, 1, 1)) == 1


# -- fetch failures are not "no actions" ----------------------------------

def test_fetch_failure_returns_none_and_is_not_cached(monkeypatch):
    calls = {"n": 0}

    class Boom:
        def __init__(self, ticker):
            calls["n"] += 1

        @property
        def actions(self):
            raise RuntimeError("network down")

    corporate_actions._cache.clear()
    monkeypatch.setattr(corporate_actions.yf, "Ticker", Boom)

    assert corporate_actions.fetch_corporate_actions("AAA.IS") is None
    assert corporate_actions.fetch_corporate_actions("AAA.IS") is None
    assert calls["n"] == 2


def test_fetch_parses_and_caches(monkeypatch):
    frame = pd.DataFrame(
        {"Dividends": [0.0, 6.746953], "Stock Splits": [7.0, 0.0]},
        index=pd.to_datetime(["2023-04-04", "2026-09-30"]).tz_localize("Europe/Istanbul"),
    )
    calls = {"n": 0}

    class Fake:
        def __init__(self, ticker):
            calls["n"] += 1

        actions = frame

    corporate_actions._cache.clear()
    monkeypatch.setattr(corporate_actions.yf, "Ticker", Fake)

    result = corporate_actions.fetch_corporate_actions("TUPRS.IS")
    assert result.splits == ((date(2023, 4, 4), D("7.0")),)
    assert result.dividends == ((date(2026, 9, 30), D("6.746953")),)

    corporate_actions.fetch_corporate_actions("TUPRS.IS")
    assert calls["n"] == 1


# -- stored-price reconciliation -----------------------------------------

def _fresh(rows):
    return pd.DataFrame(rows, columns=["date", "close"])


def test_legacy_dividend_adjusted_rows_are_detected():
    # Real TUPRS values: Adj Close vs raw Close before the 2026-09-30 dividend.
    stored = {date(2026, 9, 29): D("376.503052")}
    fresh = _fresh([(date(2026, 9, 29), 383.25)])
    assert _prices_disagree(stored, fresh)


def test_rounding_noise_is_not_a_mismatch():
    stored = {date(2026, 9, 29): D("383.25"), date(2022, 4, 1): D("32.49")}
    fresh = _fresh([(date(2026, 9, 29), 383.25), (date(2022, 4, 1), 32.485714)])
    assert not _prices_disagree(stored, fresh)


def test_non_overlapping_or_empty_is_not_a_mismatch():
    assert not _prices_disagree({}, _fresh([(date(2026, 9, 29), 383.25)]))
    assert not _prices_disagree(
        {date(2026, 1, 2): D("10")}, _fresh([(date(2026, 9, 29), 383.25)])
    )


def test_rewrite_refreshes_other_portfolios_dates_without_deleting(monkeypatch):
    from app.services import portfolio_service as ps

    # Another portfolio stored Jan 2025; this portfolio holds Jun 2025.
    stored = {date(2025, 1, 2): D("90.00"), date(2025, 6, 2): D("95.00")}
    window = _fresh([(date(2025, 6, 2), 100.0), (date(2025, 6, 3), 101.0)])
    full = _fresh(
        [
            (date(2025, 1, 2), 94.0),
            (date(2025, 1, 3), 94.5),  # never stored, not held here → skip
            (date(2025, 6, 2), 100.0),
            (date(2025, 6, 3), 101.0),
        ]
    )
    downloads = []
    written = {}

    def fake_download(ticker, start, end):
        downloads.append((start, end))
        return full

    def fake_upsert(db, ticker, prices, overwrite):
        written["rows"] = sorted(zip(prices["date"], prices["close"]))
        written["overwrite"] = overwrite
        return len(prices)

    monkeypatch.setattr(ps, "_download_prices", fake_download)
    monkeypatch.setattr(ps, "_upsert_prices", fake_upsert)

    count = ps._rewrite_ticker_history(
        None, "AAA.IS", stored, window, [(date(2025, 6, 2), date(2025, 6, 3))]
    )

    assert downloads == [(date(2025, 1, 2), date(2025, 6, 3))]
    assert written["overwrite"] is True
    assert written["rows"] == [
        (date(2025, 1, 2), 94.0),
        (date(2025, 6, 2), 100.0),
        (date(2025, 6, 3), 101.0),
    ]
    assert count == 3
