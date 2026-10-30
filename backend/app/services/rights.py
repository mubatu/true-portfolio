"""
Rights issues (bedelli sermaye artırımı). Pure: no DB, no network.

Why this exists
---------------
For BIST rights issues Yahoo records **no** corporate action. Instead it
silently divides the last few closes (4–7 trading days) and every
dividend before the ex-date by the issue's price factor
``f = P_old / P_theoretical``, where

    P_theoretical = (P_old + ratio × subscription_price) / (1 + ratio)

(verified on KONTR, BRMEN, ORCAY, TUCLK in 2025 and MARTI in 2026: the
last restated close equals the theoretical price Borsa İstanbul
announces; older closes stay real, so the restated run starts with a
drop of about f). Left alone, a holder from before the issue would see a
fake ~50% loss on a 100% rights issue. We undo the restatement — closes
from ``restated_from`` to the ex-date and earlier dividends × f — so
prices are real, and the ex-date drop is real too. What the holder did
with the rights then decides the outcome:

  - exercised  → a normal buy of ``shares × ratio`` at the subscription price
  - sold       → a ``rights_sale`` transaction (realized gain, zero cost)
  - lapsed     → nothing; the drop is a real loss

Factors come from two places:
  - detection: a sync sees stored closes ≠ fresh closes by a constant
    factor before some date and equal after it, with no split there;
  - manual entry: ratio + subscription price from the KAP announcement,
    with the factor inferred from Yahoo's closes around the ex-date.
"""

import math
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

# Ratio of stored/fresh close treated as "unchanged" (rounding, tiny revisions).
SAME_TOLERANCE = Decimal("0.002")
# Smallest factor treated as a restatement rather than noise.
MIN_FACTOR = Decimal("1.01")
# Two records for one ticker closer than this are the same event.
SAME_EVENT_WINDOW = timedelta(days=10)
# Trading days before an ex-date searched for the start of the restated run.
RESTATED_SEARCH_DAYS = 15


@dataclass(frozen=True)
class RightsIssue:
    ticker: str
    ex_date: date
    price_factor: Decimal
    ratio: Decimal | None = None
    subscription_price: Decimal | None = None
    source: str = "manual"
    needs_review: bool = False
    restated_from: date | None = None
    """First close Yahoo restated; None = every close before the ex-date."""


@dataclass(frozen=True)
class Detection:
    ex_date: date
    factor: Decimal
    """Extra factor Yahoo applied since the stored copy (stored / fresh)."""
    exact: bool
    """False when the ex-date had to be estimated (no stored data after it)."""
    restated_from: date | None = None


# ------------------------------------------------------------------
# Correction
# ------------------------------------------------------------------

def cumulative_factor(issues: list[RightsIssue], on: date) -> Decimal:
    """Product of factors of every issue going ex after ``on``."""
    factor = Decimal(1)
    for issue in issues:
        if on < issue.ex_date:
            factor *= issue.price_factor
    return factor


def close_factor(issues: list[RightsIssue], on: date) -> Decimal:
    """Like ``cumulative_factor``, but only issues whose restated run covers ``on``."""
    factor = Decimal(1)
    for issue in issues:
        if on < issue.ex_date and (issue.restated_from is None or issue.restated_from <= on):
            factor *= issue.price_factor
    return factor


def correct_closes(
    closes: dict[date, Decimal], issues: list[RightsIssue]
) -> dict[date, Decimal]:
    """Undo Yahoo's rights restatement: restated closes × factor."""
    if not issues:
        return closes
    return {d: c * close_factor(issues, d) for d, c in closes.items()}


def correct_dividend(
    ex_date: date, gross_per_share: Decimal, issues: list[RightsIssue]
) -> Decimal:
    """Yahoo divides earlier dividends by the same factor; undo it."""
    return gross_per_share * cumulative_factor(issues, ex_date)


# ------------------------------------------------------------------
# Factor for a manually entered issue
# ------------------------------------------------------------------

def infer_price_factor(
    closes: dict[date, Decimal],
    ex_date: date,
    ratio: Decimal,
    subscription_price: Decimal,
) -> tuple[Decimal, bool]:
    """Factor Yahoo applied to closes before ``ex_date``, and whether we
    could tell. Returns ``(factor, certain)``.

    Two hypotheses for Yahoo's last close before the ex-date (``y0``):
      restated:     y0 is the theoretical price → the ex-date close stays
                    near y0; factor = ((1 + ratio)·y0 − ratio·S) / y0
      not restated: y0 is the real old price → the ex-date close drops to
                    near (y0 + ratio·S) / (1 + ratio); factor = 1
    The ex-date close picks whichever prediction is closer (log distance).
    Without an ex-date close yet we cannot tell; assume not restated.
    """
    before = [d for d in closes if d < ex_date]
    if not before:
        return Decimal(1), False
    y0 = closes[max(before)]

    restated_factor = ((1 + ratio) * y0 - ratio * subscription_price) / y0
    if restated_factor <= 1:
        return Decimal(1), True  # nothing to undo (price at/below subscription)

    on_or_after = [d for d in closes if d >= ex_date]
    if not on_or_after:
        return Decimal(1), False
    y1 = closes[min(on_or_after)]

    predicted_if_restated = y0
    predicted_if_not = (y0 + ratio * subscription_price) / (1 + ratio)
    if _log_distance(y1, predicted_if_restated) <= _log_distance(y1, predicted_if_not):
        return restated_factor, True
    return Decimal(1), True


def infer_restated_from(
    closes: dict[date, Decimal], ex_date: date, factor: Decimal
) -> date | None:
    """First close Yahoo restated before ``ex_date``, from Yahoo's closes.

    The restated run starts where the price falls by about ``factor`` from
    one day to the next (real day-to-day moves stay within ±10%). Among the
    last ``RESTATED_SEARCH_DAYS`` closes, the drop closest to ``factor`` wins
    if it is closer to ``factor`` than to no change; otherwise None.
    """
    if factor <= 1:
        return None
    before = sorted(d for d in closes if d < ex_date)[-(RESTATED_SEARCH_DAYS + 1):]
    best: date | None = None
    best_distance = math.inf
    for prev, day in zip(before, before[1:]):
        drop = _log_distance(closes[prev], closes[day])
        distance = _log_distance(closes[prev] / closes[day], factor)
        if closes[prev] > closes[day] and distance < drop and distance < best_distance:
            best, best_distance = day, distance
    return best


def _log_distance(a: Decimal, b: Decimal) -> float:
    return abs(math.log(float(a) / float(b)))


# ------------------------------------------------------------------
# Detection during sync
# ------------------------------------------------------------------

def detect_restatement(
    stored: dict[date, Decimal],
    fresh: dict[date, Decimal],
    fresh_splits: dict[date, Decimal],
) -> Detection | None:
    """Find a silent restatement between a stored and a fresh download.

    Pattern: on overlapping days, stored/fresh is ≈ 1, then a constant
    ``g > 1`` for a run of days, then ≈ 1 again (or the overlap ends). A
    split with ratio ≈ g in that place explains it instead and is ignored.
    """
    overlap = sorted(d for d in stored if d in fresh)
    if len(overlap) < 3:
        return None

    ratios = [stored[d] / fresh[d] for d in overlap]
    changed = [abs(r - 1) > SAME_TOLERANCE for r in ratios]
    if not any(changed):
        return None

    first_changed = min(i for i, c in enumerate(changed) if c)
    last_changed = max(i for i, c in enumerate(changed) if c)
    run = ratios[first_changed : last_changed + 1]
    if len(run) < 2 or not all(changed[first_changed : last_changed + 1]):
        return None  # one-off or mixed pattern: ordinary revisions, not a restatement

    g = sorted(run)[len(run) // 2]
    if g < MIN_FACTOR or any(abs(r / g - 1) > SAME_TOLERANCE for r in run):
        return None

    last_restated = overlap[last_changed]
    if last_changed + 1 < len(overlap):
        ex_date, exact = overlap[last_changed + 1], True
    else:
        ex_date, exact = _estimate_ex_date(fresh, last_restated), False

    split_window_end = ex_date if exact else max(fresh)
    for split_date, split_ratio in fresh_splits.items():
        if last_restated < split_date <= split_window_end and abs(split_ratio / g - 1) < Decimal("0.01"):
            return None

    restated_from = (
        overlap[first_changed]
        if first_changed > 0
        else infer_restated_from(fresh, ex_date, g)
    )
    return Detection(ex_date=ex_date, factor=g, exact=exact, restated_from=restated_from)


def _estimate_ex_date(fresh: dict[date, Decimal], last_known_restated: date) -> date:
    """Best guess when the stored copy ends before the ex-date.

    Restated closes are almost never on the 0.01 price tick, real ones
    always are — except the last restated day, which equals the
    (rounded) theoretical price. So: the ex-date is two trading days after
    the last off-tick close, or one if there is no second.
    """
    later = sorted(d for d in fresh if d > last_known_restated)
    off_tick = [d for d in later if not _on_tick(fresh[d])]
    anchor = off_tick[-1] if off_tick else last_known_restated
    following = [d for d in later if d > anchor]
    if len(following) >= 2:
        return following[1]
    if following:
        return following[0]
    return anchor + timedelta(days=1)


def _on_tick(close: Decimal) -> bool:
    return abs(close * 100 - round(close * 100)) < Decimal("0.0001")


def same_event(a: date, b: date) -> bool:
    return abs(a - b) <= SAME_EVENT_WINDOW
