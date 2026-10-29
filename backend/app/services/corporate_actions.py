"""
Corporate actions (stock splits + cash dividends) from yfinance.

Both series come from Yahoo already expressed in *today's* share basis:
split ratios are cumulative-ready, and dividend amounts are divided by
every later split. Transaction quantities are adjusted to the same basis
(see ``adjusted_quantity``), so ``adjusted_quantity × dividend`` is the
cash actually received.

Fetches are cached per ticker for a short time so one analysis run does
not hit Yahoo several times for the same symbol. Failed fetches are never
cached and are reported as ``None`` — callers must not treat a failure as
"no corporate actions", because that would silently rewrite split
adjustments or drop dividend income.
"""

import time
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

import pandas as pd
import yfinance as yf

_CACHE_TTL_SECONDS = 60 * 60
_cache: dict[str, tuple[float, "CorporateActions"]] = {}


@dataclass(frozen=True)
class CorporateActions:
    splits: tuple[tuple[date, Decimal], ...]
    """``(split_date, ratio)`` sorted by date; ratio 2 means 1 share → 2."""

    dividends: tuple[tuple[date, Decimal], ...]
    """``(ex_date, gross_amount_per_share)`` sorted by date."""


def fetch_corporate_actions(ticker: str) -> CorporateActions | None:
    """Return split and dividend events for ``ticker``, or ``None`` on failure."""
    cached = _cache.get(ticker)
    if cached is not None and time.monotonic() - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]

    try:
        actions = yf.Ticker(ticker).actions
    except Exception:
        return None

    if actions is None:
        return None

    result = CorporateActions(
        splits=_positive_events(actions, "Stock Splits"),
        dividends=_positive_events(actions, "Dividends"),
    )
    _cache[ticker] = (time.monotonic(), result)
    return result


def split_factor_between_dates(
    split_events: tuple[tuple[date, Decimal], ...] | list[tuple[date, Decimal]],
    start_date: date,
    end_date: date,
) -> Decimal:
    """Cumulative split factor for ``(start_date, end_date]``."""
    if end_date <= start_date or not split_events:
        return Decimal(1)

    factor = Decimal(1)
    for split_date, ratio in split_events:
        if start_date < split_date <= end_date:
            factor *= ratio
    return factor


def _positive_events(
    actions: pd.DataFrame, column: str
) -> tuple[tuple[date, Decimal], ...]:
    if actions.empty or column not in actions.columns:
        return ()

    events: list[tuple[date, Decimal]] = []
    for event_ts, value in actions[column].items():
        if pd.isna(value):
            continue

        amount = Decimal(str(value))
        if amount <= 0:
            continue

        event_dt = pd.to_datetime(event_ts, errors="coerce")
        if pd.isna(event_dt):
            continue

        events.append((event_dt.date(), amount))

    events.sort(key=lambda x: x[0])
    return tuple(events)
