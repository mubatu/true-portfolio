"""
Market data cache in Postgres, refreshed from Yahoo at most once a day.

Tables (see supabase/migrations/20261030120000_market_data_sync.sql):
  - ``market_prices``     raw daily closes
  - ``corporate_actions`` stock splits and cash dividends
  - ``market_data_sync``  stored window and last sync per ticker

Sync rule: a ticker is refreshed when its stored window does not reach
back to the earliest date someone needs, or forward to the latest date
someone needs (yesterday for open positions). A refresh always rewrites
the *whole* stored window in one transaction, so every stored price and
corporate action of a ticker shares one basis — also after a new split,
which makes Yahoo restate the entire raw-close history.

Analysis code only reads from these tables; it never calls Yahoo.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.services import yahoo


@dataclass(frozen=True)
class SyncWindow:
    covered_from: date
    covered_through: date


@dataclass(frozen=True)
class CorporateActions:
    splits: tuple[tuple[date, Decimal], ...] = ()
    """``(date, ratio)`` sorted by date; ratio 2 means 1 share → 2."""

    dividends: tuple[tuple[date, Decimal], ...] = ()
    """``(ex_date, gross_amount_per_share)`` sorted by date."""


@dataclass(frozen=True)
class SyncResult:
    synced: list[str]
    failed: list[str]


# ------------------------------------------------------------------
# Sync
# ------------------------------------------------------------------

def ensure_market_data(
    db: Session,
    needs: dict[str, tuple[date, date]],
    today: date | None = None,
) -> SyncResult:
    """Make sure every ticker's ``(need_from, need_through)`` is stored.

    Stale tickers are downloaded in a single batched Yahoo request.
    Tickers Yahoo returns nothing for keep their stored data and are
    reported in ``failed``.
    """
    today = today or date.today()
    yesterday = today - timedelta(days=1)
    windows = load_sync_windows(db, list(needs))

    stale: dict[str, date] = {}
    for ticker, (need_from, need_through) in needs.items():
        need_from = min(need_from, yesterday)
        need_through = min(need_through, yesterday)
        window = windows.get(ticker)

        if window is None:
            # First sync. Also heal rows written before sync tracking existed
            # (they may be dividend-adjusted) by covering them too.
            legacy_from = _stored_min_date(db, ticker)
            stale[ticker] = min(need_from, legacy_from) if legacy_from else need_from
        elif window.covered_from > need_from or window.covered_through < need_through:
            stale[ticker] = min(window.covered_from, need_from)

    if not stale:
        return SyncResult(synced=[], failed=[])

    # ``today`` is included so a split taking effect today is not missed;
    # today's (unfinished) close is dropped when storing.
    histories = yahoo.download_histories(sorted(stale), min(stale.values()), today)

    synced: list[str] = []
    failed: list[str] = []
    for ticker, start in sorted(stale.items()):
        history = histories.get(ticker)
        if history is None or not _store_history(
            db, ticker, history, start, yesterday, today
        ):
            failed.append(ticker)
        else:
            synced.append(ticker)

    return SyncResult(synced=synced, failed=failed)


def _store_history(
    db: Session,
    ticker: str,
    history: yahoo.TickerHistory,
    start: date,
    through: date,
    today: date,
) -> bool:
    """Replace the ticker's stored window with ``history``. One transaction.

    Rows are sent as arrays and expanded with ``unnest`` so each table is
    written in a single round trip (row-by-row executemany against a
    remote database takes minutes for a few years of history).
    """
    closes = sorted((d, c) for d, c in history.closes.items() if start <= d <= through)
    if not closes:
        return False

    actions = [
        (d, kind, v)
        for kind, events in (("split", history.splits), ("dividend", history.dividends))
        for d, v in sorted(events.items())
        if start <= d <= today
    ]
    window = {"ticker": ticker, "start": start, "through": through, "today": today}

    try:
        db.execute(
            text(
                """
                DELETE FROM market_prices
                WHERE ticker = :ticker AND date BETWEEN :start AND :through
                """
            ),
            window,
        )
        db.execute(
            text(
                """
                INSERT INTO market_prices (ticker, date, close)
                SELECT :ticker, d, c
                FROM unnest(CAST(:dates AS date[]), CAST(:closes AS numeric[])) AS t(d, c)
                ON CONFLICT (ticker, date) DO UPDATE SET close = EXCLUDED.close
                """
            ),
            {
                "ticker": ticker,
                "dates": [d for d, _ in closes],
                "closes": [c for _, c in closes],
            },
        )
        db.execute(
            text(
                """
                DELETE FROM corporate_actions
                WHERE ticker = :ticker AND date BETWEEN :start AND :today
                """
            ),
            window,
        )
        if actions:
            db.execute(
                text(
                    """
                    INSERT INTO corporate_actions (ticker, date, kind, value)
                    SELECT :ticker, d, k, v
                    FROM unnest(
                        CAST(:dates AS date[]),
                        CAST(:kinds AS text[]),
                        CAST(:values AS numeric[])
                    ) AS t(d, k, v)
                    ON CONFLICT (ticker, date, kind) DO UPDATE SET value = EXCLUDED.value
                    """
                ),
                {
                    "ticker": ticker,
                    "dates": [d for d, _, _ in actions],
                    "kinds": [k for _, k, _ in actions],
                    "values": [v for _, _, v in actions],
                },
            )
        db.execute(
            text(
                """
                INSERT INTO market_data_sync (ticker, covered_from, covered_through, synced_at)
                VALUES (:ticker, :start, :through, now())
                ON CONFLICT (ticker) DO UPDATE SET
                    covered_from = EXCLUDED.covered_from,
                    covered_through = EXCLUDED.covered_through,
                    synced_at = EXCLUDED.synced_at
                """
            ),
            window,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return True


# ------------------------------------------------------------------
# Reads
# ------------------------------------------------------------------

def load_sync_windows(db: Session, tickers: list[str]) -> dict[str, SyncWindow]:
    if not tickers:
        return {}
    rows = db.execute(
        text(
            """
            SELECT ticker, covered_from, covered_through
            FROM market_data_sync
            WHERE ticker IN :tickers
            """
        ).bindparams(bindparam("tickers", expanding=True)),
        {"tickers": tickers},
    ).fetchall()
    return {t: SyncWindow(f, th) for t, f, th in rows}


def load_closes(
    db: Session, tickers: list[str], start: date, end: date
) -> dict[str, dict[date, Decimal]]:
    """Stored closes per ticker within ``[start, end]``."""
    if not tickers or end < start:
        return {}
    rows = db.execute(
        text(
            """
            SELECT ticker, date, close
            FROM market_prices
            WHERE ticker IN :tickers AND date BETWEEN :start AND :end
            """
        ).bindparams(bindparam("tickers", expanding=True)),
        {"tickers": tickers, "start": start, "end": end},
    ).fetchall()

    closes: dict[str, dict[date, Decimal]] = {t: {} for t in tickers}
    for ticker, price_date, close in rows:
        closes[ticker][price_date] = Decimal(str(close))
    return closes


def load_corporate_actions(
    db: Session, tickers: list[str]
) -> dict[str, CorporateActions]:
    if not tickers:
        return {}
    rows = db.execute(
        text(
            """
            SELECT ticker, date, kind, value
            FROM corporate_actions
            WHERE ticker IN :tickers
            ORDER BY ticker, date
            """
        ).bindparams(bindparam("tickers", expanding=True)),
        {"tickers": tickers},
    ).fetchall()

    splits: dict[str, list[tuple[date, Decimal]]] = {t: [] for t in tickers}
    dividends: dict[str, list[tuple[date, Decimal]]] = {t: [] for t in tickers}
    for ticker, action_date, kind, value in rows:
        target = splits if kind == "split" else dividends
        target[ticker].append((action_date, Decimal(str(value))))

    return {
        t: CorporateActions(splits=tuple(splits[t]), dividends=tuple(dividends[t]))
        for t in tickers
    }


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


def _stored_min_date(db: Session, ticker: str) -> date | None:
    row = db.execute(
        text("SELECT MIN(date) FROM market_prices WHERE ticker = :ticker"),
        {"ticker": ticker},
    ).fetchone()
    return row[0] if row else None
