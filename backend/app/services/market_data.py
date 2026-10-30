"""
Market data cache in Postgres, refreshed from Yahoo at most once a day.

Tables (see supabase/migrations/):
  - ``market_prices``     raw daily closes, exactly as Yahoo returns them
  - ``corporate_actions`` stock splits and cash dividends
  - ``market_data_sync``  stored window and last sync per ticker
  - ``rights_issues``     rights issues Yahoo restated silently; their price
                          factors are applied when reading (see rights.py)
  - ``split_corrections`` split ratios Yahoo reports wrongly (they replace
                          Yahoo's split on the same date when reading), and
                          splits whose older closes Yahoo left unadjusted

Sync rule: a ticker is refreshed when its stored window does not reach
back to the earliest date someone needs, or forward to the latest date
someone needs (the last settled day for open positions: today once the
market has closed, else yesterday). A refresh always rewrites
the *whole* stored window in one transaction, so every stored price and
corporate action of a ticker shares one basis — also after a new split,
which makes Yahoo restate the entire raw-close history.

Before a window is rewritten, the stored copy is compared with the fresh
one: a constant factor up to some day with no split there is a silent
rights-issue restatement, recorded in ``rights_issues``.

Analysis code only reads from these tables; it never calls Yahoo.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.core.markets import uses_uploaded_prices
from app.services import rights, yahoo
from app.services.rights import RightsIssue


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

    unadjusted_closes: tuple[tuple[date, Decimal], ...] = ()
    """``(adjusted_from, ratio)``: closes before ``adjusted_from`` Yahoo left
    in the pre-split basis; divide them by ``ratio`` (see split_corrections)."""


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
    settled: date | None = None,
) -> SyncResult:
    """Make sure every ticker's ``(need_from, need_through)`` is stored.

    ``settled`` is the last day whose closes are final (default yesterday;
    today once the market has closed). A ticker synced before today
    settled is synced once more to pick up today's close.

    Stale tickers are downloaded in a single batched Yahoo request.
    Tickers Yahoo returns nothing for keep their stored data and are
    reported in ``failed``. Upload-priced tickers (TEFAS funds) are skipped.
    """
    needs = {t: window for t, window in needs.items() if not uses_uploaded_prices(t)}
    today = today or date.today()
    settled = settled or today - timedelta(days=1)
    windows = load_sync_windows(db, list(needs))

    stale: dict[str, date] = {}
    for ticker, (need_from, need_through) in needs.items():
        need_from = min(need_from, settled)
        need_through = min(need_through, settled)
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
    # closes after ``settled`` (today's, while unfinished) are dropped.
    histories = yahoo.download_histories(sorted(stale), min(stale.values()), today)

    synced: list[str] = []
    failed: list[str] = []
    for ticker, start in sorted(stale.items()):
        history = histories.get(ticker)
        if history is None or not _store_history(
            db, ticker, history, start, settled, today
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

    detection = rights.detect_restatement(
        _stored_closes(db, ticker, start, through), dict(closes), history.splits
    )

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
        if detection is not None:
            _record_detected_issue(db, ticker, detection)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return True


def save_uploaded_closes(db: Session, ticker: str, closes: dict[date, Decimal]) -> None:
    """Merge uploaded closes into ``market_prices`` (a day already stored is
    overwritten; days outside the file are kept). One transaction."""
    if not closes:
        return
    days = sorted(closes)
    try:
        db.execute(
            text(
                """
                INSERT INTO market_prices (ticker, date, close)
                SELECT :ticker, d, c
                FROM unnest(CAST(:dates AS date[]), CAST(:closes AS numeric[])) AS t(d, c)
                ON CONFLICT (ticker, date) DO UPDATE SET close = EXCLUDED.close
                """
            ),
            {"ticker": ticker, "dates": days, "closes": [closes[d] for d in days]},
        )
        db.commit()
    except Exception:
        db.rollback()
        raise


def load_price_ranges(
    db: Session, tickers: list[str]
) -> dict[str, tuple[date, date, int]]:
    """``(first_date, last_date, day_count)`` of stored closes per ticker."""
    if not tickers:
        return {}
    rows = db.execute(
        text(
            """
            SELECT ticker, MIN(date), MAX(date), COUNT(*)
            FROM market_prices
            WHERE ticker IN :tickers
            GROUP BY ticker
            """
        ).bindparams(bindparam("tickers", expanding=True)),
        {"tickers": tickers},
    ).fetchall()
    return {t: (first, last, count) for t, first, last, count in rows}


def _stored_closes(db: Session, ticker: str, start: date, end: date) -> dict[date, Decimal]:
    return load_closes(db, [ticker], start, end).get(ticker, {})


def _record_detected_issue(db: Session, ticker: str, detection: rights.Detection) -> None:
    """Add a detected restatement, folding it into a known nearby issue."""
    nearby = _nearby_issue(db, ticker, detection.ex_date)
    if nearby is not None:
        db.execute(
            text(
                """
                UPDATE rights_issues
                SET price_factor = price_factor * :factor,
                    restated_from = COALESCE(restated_from, :restated_from),
                    updated_at = now()
                WHERE ticker = :ticker AND ex_date = :ex_date
                """
            ),
            {
                "ticker": ticker,
                "ex_date": nearby.ex_date,
                "factor": detection.factor,
                "restated_from": detection.restated_from,
            },
        )
        return

    db.execute(
        text(
            """
            INSERT INTO rights_issues
                (ticker, ex_date, price_factor, source, needs_review, restated_from)
            VALUES (:ticker, :ex_date, :factor, 'detected', :needs_review, :restated_from)
            """
        ),
        {
            "ticker": ticker,
            "ex_date": detection.ex_date,
            "factor": detection.factor,
            "needs_review": not detection.exact or detection.restated_from is None,
            "restated_from": detection.restated_from,
        },
    )


# ------------------------------------------------------------------
# Rights issues
# ------------------------------------------------------------------

def save_rights_issue(
    db: Session,
    ticker: str,
    ex_date: date,
    ratio: Decimal,
    subscription_price: Decimal,
) -> RightsIssue:
    """Create or update a rights issue from its KAP terms.

    The price factor is inferred from the stored closes around the
    ex-date (caller syncs them first), and so is the first restated close.
    A detected record for the same event keeps its measured factor and
    gets the terms and exact date.
    """
    closes = load_closes(
        db, [ticker], ex_date - timedelta(days=30), ex_date + timedelta(days=10)
    ).get(ticker, {})
    factor, certain = rights.infer_price_factor(closes, ex_date, ratio, subscription_price)

    nearby = _nearby_issue(db, ticker, ex_date)
    if nearby is not None:
        if nearby.source == "detected" or not certain:
            factor = nearby.price_factor
            certain = certain or nearby.source == "detected"
    restated_from = rights.infer_restated_from(closes, ex_date, factor)
    if restated_from is None and nearby is not None:
        restated_from = nearby.restated_from
    if nearby is not None:
        db.execute(
            text("DELETE FROM rights_issues WHERE ticker = :ticker AND ex_date = :ex_date"),
            {"ticker": ticker, "ex_date": nearby.ex_date},
        )

    issue = RightsIssue(
        ticker=ticker,
        ex_date=ex_date,
        price_factor=factor,
        ratio=ratio,
        subscription_price=subscription_price,
        source="manual",
        needs_review=not certain or (factor > 1 and restated_from is None),
        restated_from=restated_from,
    )
    db.execute(
        text(
            """
            INSERT INTO rights_issues
                (ticker, ex_date, price_factor, ratio, subscription_price, source,
                 needs_review, restated_from)
            VALUES (:ticker, :ex_date, :factor, :ratio, :price, 'manual',
                    :needs_review, :restated_from)
            """
        ),
        {
            "ticker": ticker,
            "ex_date": ex_date,
            "factor": issue.price_factor,
            "ratio": ratio,
            "price": subscription_price,
            "needs_review": issue.needs_review,
            "restated_from": restated_from,
        },
    )
    db.commit()
    return issue


def delete_rights_issue(db: Session, ticker: str, ex_date: date) -> bool:
    result = db.execute(
        text("DELETE FROM rights_issues WHERE ticker = :ticker AND ex_date = :ex_date"),
        {"ticker": ticker, "ex_date": ex_date},
    )
    db.commit()
    return bool(result.rowcount)


def load_rights_issues(db: Session, tickers: list[str]) -> dict[str, list[RightsIssue]]:
    if not tickers:
        return {}
    rows = db.execute(
        text(
            """
            SELECT ticker, ex_date, price_factor, ratio, subscription_price, source,
                   needs_review, restated_from
            FROM rights_issues
            WHERE ticker IN :tickers
            ORDER BY ticker, ex_date
            """
        ).bindparams(bindparam("tickers", expanding=True)),
        {"tickers": tickers},
    ).fetchall()

    issues: dict[str, list[RightsIssue]] = {t: [] for t in tickers}
    for ticker, ex_date, factor, ratio, price, source, needs_review, restated_from in rows:
        issues[ticker].append(
            RightsIssue(
                ticker=ticker,
                ex_date=ex_date,
                price_factor=Decimal(str(factor)),
                ratio=Decimal(str(ratio)) if ratio is not None else None,
                subscription_price=Decimal(str(price)) if price is not None else None,
                source=source,
                needs_review=needs_review,
                restated_from=restated_from,
            )
        )
    return issues


def _nearby_issue(db: Session, ticker: str, ex_date: date) -> RightsIssue | None:
    for issue in load_rights_issues(db, [ticker])[ticker]:
        if rights.same_event(issue.ex_date, ex_date):
            return issue
    return None


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

    ratios: dict[str, dict[date, Decimal]] = {t: {} for t in tickers}
    unadjusted: dict[str, list[tuple[date, Decimal]]] = {t: [] for t in tickers}
    for ticker, split_date, ratio, adjusted_from in load_split_corrections(db, tickers):
        ratios[ticker][split_date] = ratio
        if adjusted_from is not None:
            unadjusted[ticker].append((adjusted_from, ratio))

    return {
        t: CorporateActions(
            splits=apply_split_corrections(splits[t], ratios[t]),
            dividends=tuple(dividends[t]),
            unadjusted_closes=tuple(sorted(unadjusted[t])),
        )
        for t in tickers
    }


def load_split_corrections(
    db: Session, tickers: list[str]
) -> list[tuple[str, date, Decimal, date | None]]:
    """``(ticker, date, ratio, adjusted_from)`` rows of ``split_corrections``."""
    if not tickers:
        return []
    rows = db.execute(
        text(
            """
            SELECT ticker, date, ratio, adjusted_from
            FROM split_corrections
            WHERE ticker IN :tickers
            """
        ).bindparams(bindparam("tickers", expanding=True)),
        {"tickers": tickers},
    ).fetchall()
    return [(t, d, Decimal(str(r)), a) for t, d, r, a in rows]


def apply_split_corrections(
    splits: list[tuple[date, Decimal]] | tuple[tuple[date, Decimal], ...],
    corrections: dict[date, Decimal],
) -> tuple[tuple[date, Decimal], ...]:
    """Yahoo's splits with a corrected ratio replacing (or adding) its date."""
    merged = dict(splits)
    merged.update(corrections)
    return tuple(sorted(merged.items()))


def adjust_unadjusted_closes(
    closes: dict[date, Decimal],
    unadjusted: tuple[tuple[date, Decimal], ...],
) -> dict[date, Decimal]:
    """Bring closes Yahoo left in a pre-split basis onto the split-adjusted one."""
    if not unadjusted:
        return closes
    adjusted = dict(closes)
    for adjusted_from, ratio in unadjusted:
        for d in adjusted:
            if d < adjusted_from:
                adjusted[d] /= ratio
    return adjusted


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
