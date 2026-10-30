"""
Explore: public portfolios as everyone may see them.

The full analysis is computed as for the owner, then reduced to what is
safe to publish: dates, the time-weighted return (unit price), public
market closes for comparison and the current allocation as percentages.
No amount of money, quantity, price paid, transaction, user id or e-mail
ever leaves this module. The reducers below are pure; the loaders read
the DB and reuse ``analyze_portfolio`` (with its once-a-day sync).
"""

import calendar
import threading
import time
from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.portfolio_service import analyze_portfolio

# Comparison closes are public market data.
_POINT_FIELDS = ("date", "twr_pct", "benchmark_close", "usd_close", "gold_close")
SPARKLINE_DAYS = 90
# Explore is open to anyone: reuse an analysis for a while instead of
# replaying the ledger on every visit. An owner's new trade shows up
# within this time.
CACHE_SECONDS = 10 * 60

_cache: dict[int, tuple[float, dict]] = {}
_cache_lock = threading.Lock()


# ── Pure reducers ───────────────────────────────────────────────────


def public_points(analysis: dict) -> list[dict]:
    return [{k: p[k] for k in _POINT_FIELDS} for p in analysis["performance_series"]["points"]]


def public_allocation(analysis: dict) -> dict:
    """Open positions and cash as % of the portfolio's current value."""
    totals = analysis["totals"]
    total = totals["portfolio_value"] + totals["in_the_safe"]
    if total <= 0:
        return {"positions": [], "cash_pct": 0.0}
    positions = [
        {"ticker": p["ticker"], "weight_pct": round(p["market_value"] / total * 100, 2)}
        for p in analysis["positions"]
        if p["quantity"] > 0 and p["market_value"] > 0
    ]
    positions.sort(key=lambda p: p["weight_pct"], reverse=True)
    return {"positions": positions, "cash_pct": round(totals["in_the_safe"] / total * 100, 2)}


def shift_months(day: date, months: int) -> date:
    """Same rule as the frontend's ``shiftMonths``: clamp to month end."""
    total = day.year * 12 + day.month - 1 + months
    year, month = divmod(total, 12)
    month += 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def period_return(points: list[dict], months: int) -> float | None:
    """Unit price change over the last ``months``, %, as the frontend's
    returns table computes it; None if the history is shorter."""
    if not points:
        return None
    last = points[-1]
    start = shift_months(date.fromisoformat(last["date"]), -months).isoformat()
    if start < points[0]["date"]:
        return None
    base = next(p for p in reversed(points) if p["date"] <= start)
    return round(((1 + last["twr_pct"] / 100) / (1 + base["twr_pct"] / 100) - 1) * 100, 4)


def _tr_upper(s: str) -> str:
    return s.replace("i", "İ").replace("ı", "I").upper()


def owner_label(full_name: str | None) -> dict:
    """"Batuhan Buber" → "Batuhan B." and "BB"; never the full name."""
    parts = (full_name or "").split()
    if not parts:
        return {"display_name": None, "initials": None}
    first, last = parts[0], parts[-1] if len(parts) > 1 else None
    return {
        "display_name": f"{first} {_tr_upper(last[0])}." if last else first,
        "initials": _tr_upper(first[0] + (last[0] if last else "")),
    }


def summary(row: dict, analysis: dict) -> dict:
    points = public_points(analysis)
    last = points[-1] if points else None
    return {
        "slug": row["slug"],
        "name": row["name"],
        "market": row["market"],
        "is_experimental": row["is_experimental"],
        "owner": owner_label(row["full_name"]),
        "start_date": points[0]["date"] if points else None,
        "end_date": last["date"] if last else None,
        "return_pct": last["twr_pct"] if last else None,
        "return_1m_pct": period_return(points, 1),
        "return_1y_pct": period_return(points, 12),
        "sparkline": [p["twr_pct"] for p in points[-SPARKLINE_DAYS:]],
    }


def detail(row: dict, analysis: dict) -> dict:
    points = public_points(analysis)
    return {
        **{k: v for k, v in summary(row, analysis).items() if k != "sparkline"},
        "points": points,
        "allocation": public_allocation(analysis),
    }


# ── Loaders ─────────────────────────────────────────────────────────

_PUBLIC_SELECT = """
    SELECT p.id, p.slug, p.name, p.market, p.is_experimental, pr.full_name
    FROM portfolios p
    LEFT JOIN profiles pr ON pr.id = p.user_id
    WHERE p.is_public
      AND EXISTS (SELECT 1 FROM transactions t WHERE t.portfolio_id = p.id)
"""


def _analysis(db: Session, portfolio_id: int) -> dict:
    now = time.monotonic()
    with _cache_lock:
        hit = _cache.get(portfolio_id)
    if hit and hit[0] > now:
        return hit[1]
    result = analyze_portfolio(db, portfolio_id)
    with _cache_lock:
        _cache[portfolio_id] = (now + CACHE_SECONDS, result)
    return result


def list_public_portfolios(db: Session) -> list[dict]:
    rows = db.execute(text(_PUBLIC_SELECT)).mappings().all()
    items = [summary(dict(r), _analysis(db, r["id"])) for r in rows]
    items = [i for i in items if i["end_date"] is not None]
    # Best performer first; the order is stable for ties.
    return sorted(items, key=lambda i: i["return_pct"], reverse=True)


def get_public_portfolio(db: Session, slug: str) -> dict | None:
    row = db.execute(text(_PUBLIC_SELECT + " AND p.slug = :slug"), {"slug": slug}).mappings().first()
    if row is None:
        return None
    return detail(dict(row), _analysis(db, row["id"]))
