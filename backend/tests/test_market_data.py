from datetime import date
from decimal import Decimal as D

import pandas as pd
import pytest

from app.core.markets import get_dividend_withholding_rate
from app.services import market_data, yahoo
from app.services.market_data import SyncWindow, split_factor_between_dates

TODAY = date(2026, 10, 30)
YESTERDAY = date(2026, 10, 29)


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


# -- splits ---------------------------------------------------------------

def test_split_factor_window_is_open_closed():
    splits = [(date(2023, 4, 4), D(7)), (date(2025, 1, 10), D(2))]
    assert split_factor_between_dates(splits, date(2023, 1, 1), date(2026, 1, 1)) == 14
    # A trade on the split date is already in the post-split basis.
    assert split_factor_between_dates(splits, date(2023, 4, 4), date(2026, 1, 1)) == 2
    assert split_factor_between_dates(splits, date(2025, 1, 10), date(2026, 1, 1)) == 1


# -- sync decisions -------------------------------------------------------

@pytest.fixture
def sync_env(monkeypatch):
    """Fake DB layer + Yahoo; records what would be downloaded and stored."""
    env = {"windows": {}, "legacy_min": {}, "available": set(), "downloads": [], "stored": {}}

    monkeypatch.setattr(
        market_data, "load_sync_windows",
        lambda db, tickers: {t: w for t, w in env["windows"].items() if t in tickers},
    )
    monkeypatch.setattr(
        market_data, "_stored_min_date", lambda db, t: env["legacy_min"].get(t)
    )

    def fake_download(tickers, start, end):
        env["downloads"].append((tuple(tickers), start, end))
        return {
            t: yahoo.TickerHistory(closes={YESTERDAY: D(1)})
            for t in tickers
            if t in env["available"]
        }

    def fake_store(db, ticker, history, start, through, today):
        env["stored"][ticker] = (start, through)
        return True

    monkeypatch.setattr(market_data.yahoo, "download_histories", fake_download)
    monkeypatch.setattr(market_data, "_store_history", fake_store)
    return env


def test_fresh_window_needs_no_download(sync_env):
    sync_env["windows"]["AAA.IS"] = SyncWindow(date(2025, 1, 2), YESTERDAY)
    result = market_data.ensure_market_data(
        None, {"AAA.IS": (date(2025, 3, 1), YESTERDAY)}, today=TODAY
    )
    assert sync_env["downloads"] == []
    assert result.synced == result.failed == []


def test_stale_tickers_are_batched_and_resync_whole_window(sync_env):
    sync_env["available"] = {"AAA.IS", "BBB.IS"}
    sync_env["windows"]["AAA.IS"] = SyncWindow(date(2025, 1, 2), date(2026, 10, 27))
    sync_env["windows"]["BBB.IS"] = SyncWindow(date(2025, 6, 2), YESTERDAY)

    result = market_data.ensure_market_data(
        None,
        {
            "AAA.IS": (date(2025, 3, 1), YESTERDAY),  # behind → from covered_from
            "BBB.IS": (date(2025, 1, 2), YESTERDAY),  # needs earlier history
        },
        today=TODAY,
    )

    assert sync_env["downloads"] == [(("AAA.IS", "BBB.IS"), date(2025, 1, 2), TODAY)]
    assert sync_env["stored"] == {
        "AAA.IS": (date(2025, 1, 2), YESTERDAY),
        "BBB.IS": (date(2025, 1, 2), YESTERDAY),
    }
    assert result.synced == ["AAA.IS", "BBB.IS"]


def test_first_sync_also_covers_legacy_rows(sync_env):
    sync_env["available"] = {"AAA.IS"}
    sync_env["legacy_min"]["AAA.IS"] = date(2024, 10, 30)
    market_data.ensure_market_data(
        None, {"AAA.IS": (date(2025, 3, 1), YESTERDAY)}, today=TODAY
    )
    assert sync_env["stored"]["AAA.IS"] == (date(2024, 10, 30), YESTERDAY)


def test_closed_position_is_not_resynced_daily(sync_env):
    sync_env["windows"]["AAA.IS"] = SyncWindow(date(2025, 1, 2), date(2025, 9, 1))
    market_data.ensure_market_data(
        None, {"AAA.IS": (date(2025, 1, 2), date(2025, 8, 15))}, today=TODAY
    )
    assert sync_env["downloads"] == []


def test_ticker_without_data_is_reported_failed(sync_env):
    sync_env["available"] = {"AAA.IS"}
    result = market_data.ensure_market_data(
        None,
        {"AAA.IS": (date(2025, 1, 2), YESTERDAY), "NOPE.IS": (date(2025, 1, 2), YESTERDAY)},
        today=TODAY,
    )
    assert result.synced == ["AAA.IS"]
    assert result.failed == ["NOPE.IS"]
    assert "NOPE.IS" not in sync_env["stored"]


# -- Yahoo frame parsing ---------------------------------------------------

def test_parse_batched_download_frame():
    index = pd.to_datetime(["2023-04-03", "2023-04-04", "2023-04-05"])
    columns = pd.MultiIndex.from_product(
        [["TUPRS.IS"], ["Close", "Dividends", "Stock Splits"]]
    )
    frame = pd.DataFrame(
        [[32.485714, 0.0, 0.0], [31.9, 0.0, 7.0], [float("nan"), 6.487455, 0.0]],
        index=index,
        columns=columns,
    )

    history = yahoo._parse_ticker(frame, "TUPRS.IS")
    assert history.closes == {
        date(2023, 4, 3): D("32.485714"),
        date(2023, 4, 4): D("31.9"),
    }
    assert history.splits == {date(2023, 4, 4): D("7.0")}
    assert history.dividends == {date(2023, 4, 5): D("6.487455")}
    assert yahoo._parse_ticker(frame, "MISSING.IS") is None
