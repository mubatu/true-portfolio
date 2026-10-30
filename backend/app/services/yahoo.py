"""
Yahoo Finance access. The only module that talks to the network.

One batched ``yf.download`` call returns, for every ticker:
  - raw daily closes (``auto_adjust=False``): restated for stock splits,
    **not** for dividends — the same basis as split-adjusted transactions;
  - stock splits and cash dividends, already in today's share basis
    (Yahoo divides past dividends by every later split).
"""

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

import pandas as pd
import yfinance as yf

# Split-restated history is not tick-aligned (e.g. 227.40 / 7 = 32.485714).
CLOSE_DECIMALS = 6


@dataclass(frozen=True)
class TickerHistory:
    closes: dict[date, Decimal] = field(default_factory=dict)
    splits: dict[date, Decimal] = field(default_factory=dict)
    dividends: dict[date, Decimal] = field(default_factory=dict)


def download_histories(
    tickers: list[str], start: date, end: date
) -> dict[str, TickerHistory]:
    """Download ``[start, end]`` (inclusive) for every ticker in one request.

    Tickers Yahoo returned no closes for are left out of the result, so
    callers can tell a failed ticker from one that simply has no events.
    """
    if not tickers or end < start:
        return {}

    try:
        frame = yf.download(
            tickers,
            start=start.isoformat(),
            end=(end + timedelta(days=1)).isoformat(),
            auto_adjust=False,
            actions=True,
            group_by="ticker",
            progress=False,
            threads=True,
        )
    except Exception:
        return {}

    if frame is None or frame.empty:
        return {}

    histories: dict[str, TickerHistory] = {}
    for ticker in tickers:
        history = _parse_ticker(frame, ticker)
        if history is not None:
            histories[ticker] = history
    return histories


def _parse_ticker(frame: pd.DataFrame, ticker: str) -> TickerHistory | None:
    if isinstance(frame.columns, pd.MultiIndex):
        if ticker not in frame.columns.get_level_values(0):
            return None
        sub = frame[ticker]
    else:
        sub = frame

    if "Close" not in sub.columns:
        return None

    closes = {
        _to_date(ts): Decimal(str(round(float(value), CLOSE_DECIMALS)))
        for ts, value in sub["Close"].items()
        if pd.notna(value)
    }
    if not closes:
        return None

    return TickerHistory(
        closes=closes,
        splits=_positive_events(sub, "Stock Splits"),
        dividends=_positive_events(sub, "Dividends"),
    )


def _positive_events(sub: pd.DataFrame, column: str) -> dict[date, Decimal]:
    if column not in sub.columns:
        return {}
    return {
        _to_date(ts): Decimal(str(value))
        for ts, value in sub[column].items()
        if pd.notna(value) and value > 0
    }


def _to_date(ts) -> date:
    return pd.Timestamp(ts).date()
