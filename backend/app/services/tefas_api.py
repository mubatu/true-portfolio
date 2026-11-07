"""
TEFAS fund prices from tefas.gov.tr's JSON API (the site's own backend
since April 2026). Undocumented and rate limited (about 6 requests a
minute), so each fund is asked at most once an hour (see market_data) and
any failure pauses all requests for a while. Uploading TEFAS's Excel
export (tefas.py) stays as the fallback.

One request returns a fund's daily prices for a fixed look-back of 1, 3,
6, 12, 36 or 60 months; nothing older than five years is available.
"""

import time
from datetime import date, timedelta
from decimal import Decimal

import httpx

PRICES_URL = "https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir"
USER_AGENT = "TruePortfolio/1.0 (+https://trueportfolio.net)"
TIMEOUT_SECONDS = 10
LOOKBACK_MONTHS = (1, 3, 6, 12, 36, 60)
# A short month, so the chosen look-back always reaches back far enough.
DAYS_PER_MONTH = 28
PAUSE_AFTER_FAILURE_SECONDS = 15 * 60

_paused_until = 0.0


def fetch_prices(fund_code: str, since: date, today: date) -> dict[date, Decimal] | None:
    """Daily prices of ``fund_code`` from about ``since`` on (more may come
    back), or ``None`` when TEFAS could not be read."""
    global _paused_until
    if time.monotonic() < _paused_until:
        return None

    try:
        response = httpx.post(
            PRICES_URL,
            json={"fonKodu": fund_code, "dil": "TR", "periyod": _lookback(since, today)},
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            timeout=TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        body = response.json()
        if body.get("errorCode"):
            raise ValueError(body.get("errorMessage") or body["errorCode"])
        rows = body.get("resultList") or []
    except Exception as e:
        print(f"TEFAS fetch failed for {fund_code}: {e!r}")
        _paused_until = time.monotonic() + PAUSE_AFTER_FAILURE_SECONDS
        return None

    prices: dict[date, Decimal] = {}
    for row in rows:
        if row.get("fonKodu") != fund_code or not row.get("fiyat"):
            continue
        price = Decimal(str(row["fiyat"]))
        if price > 0:
            prices[date.fromisoformat(row["tarih"][:10])] = price
    return prices


def _lookback(since: date, today: date) -> int:
    """Shortest look-back (months) that reaches ``since``; else the longest."""
    for months in LOOKBACK_MONTHS:
        if today - timedelta(days=months * DAYS_PER_MONTH) <= since:
            return months
    return LOOKBACK_MONTHS[-1]
