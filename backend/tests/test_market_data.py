from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from decimal import Decimal as D

import pandas as pd
import pytest

from app.core.markets import get_dividend_withholding_rate, last_settled_day
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


def test_split_correction_replaces_or_adds_yahoo_split():
    yahoo_splits = [(date(2025, 3, 6), D("763587.12")), (date(2025, 9, 11), D("1.83"))]
    corrected = market_data.apply_split_corrections(
        yahoo_splits, {date(2025, 3, 6): D("1.7"), date(2024, 1, 2): D(2)}
    )
    assert corrected == (
        (date(2024, 1, 2), D(2)),
        (date(2025, 3, 6), D("1.7")),
        (date(2025, 9, 11), D("1.83")),
    )
    assert market_data.apply_split_corrections(yahoo_splits, {}) == tuple(yahoo_splits)


def test_closes_yahoo_left_unadjusted_are_divided():
    """EUREN 2024: Yahoo adjusted Dec 2–4 for the Dec 5 split, not Nov 29."""
    closes = {
        date(2024, 11, 29): D("11.06"),
        date(2024, 12, 2): D("4.031619"),
        date(2024, 12, 5): D("4.21"),
    }
    adjusted = market_data.adjust_unadjusted_closes(
        closes, ((date(2024, 12, 2), D("2.7631577")),)
    )
    assert adjusted[date(2024, 11, 29)].quantize(D("0.01")) == D("4.00")
    assert adjusted[date(2024, 12, 2)] == D("4.031619")
    assert adjusted[date(2024, 12, 5)] == D("4.21")
    assert market_data.adjust_unadjusted_closes(closes, ()) is closes


# -- sync decisions -------------------------------------------------------

@pytest.fixture
def sync_env(monkeypatch):
    """Fake DB layer, Yahoo and TEFAS; records what would be downloaded and stored."""
    env = {
        "windows": {}, "legacy_min": {}, "available": set(), "pending": {},
        "downloads": [], "stored": {},
        "fund_prices": {}, "fund_fetches": [], "fund_stored": {},
    }

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
            t: yahoo.TickerHistory(closes={YESTERDAY: D(1)}, pending=env["pending"].get(t))
            for t in tickers
            if t in env["available"]
        }

    def fake_store(db, ticker, history, start, through, today):
        env["stored"][ticker] = (start, through)
        return True

    def fake_fetch(code, since, today):
        env["fund_fetches"].append((code, since))
        return env["fund_prices"].get(code)

    def fake_store_fund(db, ticker, prices, covered_from, covered_through):
        env["fund_stored"][ticker] = (covered_from, covered_through, sorted(prices))

    monkeypatch.setattr(market_data.yahoo, "download_histories", fake_download)
    monkeypatch.setattr(market_data, "_store_history", fake_store)
    monkeypatch.setattr(market_data.tefas_api, "fetch_prices", fake_fetch)
    monkeypatch.setattr(market_data, "_store_fund_prices", fake_store_fund)
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
    assert history.pending is None


def test_traded_day_without_a_close_is_pending():
    # Yahoo on 4 Nov 2026 at night: 3 Nov has an open but no close yet.
    # 29 Oct (holiday) is in the batched frame for other markets, all empty.
    index = pd.to_datetime(["2026-10-28", "2026-10-29", "2026-11-02", "2026-11-03"])
    columns = pd.MultiIndex.from_product([["XU100.IS"], ["Open", "Close"]])
    nan = float("nan")
    frame = pd.DataFrame(
        [[11151.0, 11165.4], [nan, nan], [10765.1, 10961.7], [10921.12, nan]],
        index=index,
        columns=columns,
    )

    history = yahoo._parse_ticker(frame, "XU100.IS")
    assert max(history.closes) == date(2026, 11, 2)
    assert history.pending == date(2026, 11, 3)


def test_pending_settled_day_is_left_uncovered(sync_env):
    sync_env["available"] = {"AAA.IS", "BBB.IS"}
    sync_env["pending"] = {"AAA.IS": YESTERDAY, "BBB.IS": TODAY}

    market_data.ensure_market_data(
        None,
        {"AAA.IS": (date(2025, 3, 1), YESTERDAY), "BBB.IS": (date(2025, 3, 1), YESTERDAY)},
        today=TODAY,
    )

    # AAA's settled close is still missing → asked again next time.
    assert sync_env["stored"]["AAA.IS"] == (date(2025, 3, 1), YESTERDAY - timedelta(days=1))
    # BBB's open bar is today's, not yet settled anyway.
    assert sync_env["stored"]["BBB.IS"] == (date(2025, 3, 1), YESTERDAY)


def test_fund_tickers_are_never_sent_to_yahoo(sync_env):
    sync_env["available"] = {"AAA.IS"}
    result = market_data.ensure_market_data(
        None,
        {"AAA.IS": (date(2025, 3, 1), YESTERDAY), "IPB.TEFAS": (date(2025, 3, 1), YESTERDAY)},
        today=TODAY,
    )
    assert sync_env["downloads"] == [(("AAA.IS",), date(2025, 3, 1), TODAY)]
    assert result.synced == ["AAA.IS"]
    assert result.failed == []


# -- TEFAS funds ----------------------------------------------------------

LONG_AGO = datetime(2026, 10, 1, tzinfo=timezone.utc)


def test_new_fund_is_fetched_from_its_first_needed_day(sync_env):
    sync_env["fund_prices"]["IPB"] = {
        date(2025, 3, 3): D("0.5"), YESTERDAY: D("0.7"), TODAY: D("0.71"),
    }
    result = market_data.ensure_market_data(
        None, {"IPB.TEFAS": (date(2025, 3, 1), YESTERDAY)}, today=TODAY
    )
    assert sync_env["fund_fetches"] == [("IPB", date(2025, 3, 1))]
    # Today's price is not settled yet; the window ends at the last stored price.
    assert sync_env["fund_stored"]["IPB.TEFAS"] == (
        date(2025, 3, 1), YESTERDAY, [date(2025, 3, 3), YESTERDAY],
    )
    assert result.synced == ["IPB.TEFAS"]


def test_covered_fund_is_not_fetched(sync_env):
    sync_env["windows"]["IPB.TEFAS"] = SyncWindow(date(2025, 3, 1), YESTERDAY, LONG_AGO)
    market_data.ensure_market_data(None, {"IPB.TEFAS": (date(2025, 3, 1), YESTERDAY)}, today=TODAY)
    assert sync_env["fund_fetches"] == []


def test_fund_missing_its_latest_price_is_asked_at_most_hourly(sync_env):
    last = date(2026, 10, 27)
    needs = {"IPB.TEFAS": (date(2025, 3, 1), YESTERDAY)}
    sync_env["windows"]["IPB.TEFAS"] = SyncWindow(
        date(2025, 3, 1), last, datetime.now(timezone.utc) - timedelta(minutes=10)
    )
    market_data.ensure_market_data(None, needs, today=TODAY)
    assert sync_env["fund_fetches"] == []

    sync_env["windows"]["IPB.TEFAS"] = SyncWindow(date(2025, 3, 1), last, LONG_AGO)
    sync_env["fund_prices"]["IPB"] = {last: D("0.7"), date(2026, 10, 28): D("0.71")}
    market_data.ensure_market_data(None, needs, today=TODAY)
    assert sync_env["fund_fetches"] == [("IPB", last)]
    assert sync_env["fund_stored"]["IPB.TEFAS"][:2] == (date(2025, 3, 1), date(2026, 10, 28))


def test_older_trade_refetches_a_fund_right_away(sync_env):
    sync_env["windows"]["IPB.TEFAS"] = SyncWindow(
        date(2025, 3, 1), YESTERDAY, datetime.now(timezone.utc)
    )
    sync_env["fund_prices"]["IPB"] = {date(2024, 6, 3): D("0.4"), YESTERDAY: D("0.7")}
    market_data.ensure_market_data(None, {"IPB.TEFAS": (date(2024, 6, 1), YESTERDAY)}, today=TODAY)
    assert sync_env["fund_fetches"] == [("IPB", date(2024, 6, 1))]
    assert sync_env["fund_stored"]["IPB.TEFAS"][:2] == (date(2024, 6, 1), YESTERDAY)


def test_unreadable_tefas_keeps_stored_fund_prices(sync_env):
    sync_env["fund_prices"]["IPB"] = None
    result = market_data.ensure_market_data(
        None, {"IPB.TEFAS": (date(2025, 3, 1), YESTERDAY)}, today=TODAY
    )
    assert sync_env["fund_stored"] == {}
    assert result.synced == result.failed == []


# -- settled day ----------------------------------------------------------

def test_today_counts_once_the_market_has_settled():
    istanbul = ZoneInfo("Europe/Istanbul")
    friday = date(2026, 10, 30)
    before = datetime(2026, 10, 30, 18, 59, tzinfo=istanbul)
    after = datetime(2026, 10, 30, 19, 0, tzinfo=istanbul)
    assert last_settled_day("BIST", before) == friday - timedelta(days=1)
    assert last_settled_day("BIST", after) == friday
    # Server clock in UTC: 16:30 UTC is 19:30 in Istanbul.
    assert last_settled_day("BIST", datetime(2026, 10, 30, 16, 30, tzinfo=timezone.utc)) == friday


def test_weekends_settle_on_the_day_before():
    istanbul = ZoneInfo("Europe/Istanbul")
    saturday_evening = datetime(2026, 10, 31, 21, 0, tzinfo=istanbul)
    assert last_settled_day("TEFAS", saturday_evening) == date(2026, 10, 30)


def test_synced_before_close_is_synced_again_for_todays_close(sync_env):
    sync_env["available"] = {"AAA.IS"}
    sync_env["windows"]["AAA.IS"] = SyncWindow(date(2025, 1, 2), YESTERDAY)  # synced this morning

    result = market_data.ensure_market_data(
        None, {"AAA.IS": (date(2025, 3, 1), TODAY)}, today=TODAY, settled=TODAY
    )

    assert result.synced == ["AAA.IS"]
    assert sync_env["stored"]["AAA.IS"] == (date(2025, 1, 2), TODAY)


def test_unsettled_today_is_not_requested(sync_env):
    sync_env["windows"]["AAA.IS"] = SyncWindow(date(2025, 1, 2), YESTERDAY)
    market_data.ensure_market_data(None, {"AAA.IS": (date(2025, 3, 1), TODAY)}, today=TODAY)
    assert sync_env["downloads"] == []
