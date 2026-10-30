"""Rights-issue logic, checked against real KONTR data (100% rights issue,
subscription 1 TL, ex-date 2025-12-09, BIST theoretical price 15.58;
Yahoo restated Dec 1–8 only)."""

from datetime import date
from decimal import Decimal as D

from app.services.analysis import build_daily_series
from app.services.ledger import LedgerTransaction, replay
from app.services.rights import (
    RightsIssue,
    correct_closes,
    correct_dividend,
    detect_restatement,
    infer_price_factor,
    infer_restated_from,
)

EX = date(2025, 12, 9)

# Yahoo's raw closes after it silently restated the history.
YAHOO = {
    date(2025, 12, 1): D("17.181393"),
    date(2025, 12, 2): D("16.664814"),
    date(2025, 12, 3): D("15.869283"),
    date(2025, 12, 4): D("15.683315"),
    date(2025, 12, 5): D("16.034588"),
    date(2025, 12, 8): D("15.58"),
    date(2025, 12, 9): D("14.31"),
    date(2025, 12, 10): D("14.33"),
}
F = (2 * D("15.58") - 1) / D("15.58")  # 30.16 / 15.58

# What the market really printed: pre-ex closes × F.
REAL = {d: (c * F).quantize(D("0.01")) if d < EX else c for d, c in YAHOO.items()}

KONTR = RightsIssue("KONTR.IS", EX, F, D(1), D(1))

# Yahoo leaves closes before its restated run real: Nov 28 printed 33.40.
YAHOO_FULL = {date(2025, 11, 28): D("33.40")} | YAHOO


def test_real_closes_are_on_tick_after_correction():
    assert REAL[date(2025, 12, 8)] == D("30.16")
    assert REAL[date(2025, 12, 1)] == D("33.26")


# -- correction ---------------------------------------------------------

def test_correct_closes_restores_real_prices():
    corrected = correct_closes(YAHOO, [KONTR])
    for day, real in REAL.items():
        assert abs(corrected[day] - real) < D("0.006"), day


def test_correct_dividend_matches_kap():
    # KAP: 2025 dividend 0.0307692 TL gross; Yahoo shows 0.015895.
    corrected = correct_dividend(date(2025, 7, 8), D("0.015895"), [KONTR])
    assert abs(corrected - D("0.0307692")) < D("0.00001")


def test_dividend_after_ex_date_is_untouched():
    assert correct_dividend(date(2026, 7, 1), D("0.5"), [KONTR]) == D("0.5")


def test_closes_before_restated_run_are_untouched():
    """Yahoo restated only Dec 1–8; Nov 28 is still the real close."""
    windowed = RightsIssue("KONTR.IS", EX, F, D(1), D(1), restated_from=date(2025, 12, 1))
    corrected = correct_closes(YAHOO_FULL, [windowed])
    assert corrected[date(2025, 11, 28)] == D("33.40")
    assert corrected[date(2025, 12, 1)].quantize(D("0.01")) == D("33.26")
    assert corrected[EX] == YAHOO[EX]


def test_dividends_are_corrected_outside_restated_run():
    windowed = RightsIssue("KONTR.IS", EX, F, D(1), D(1), restated_from=date(2025, 12, 1))
    assert correct_dividend(date(2025, 7, 8), D("0.015895"), [windowed]) == (
        correct_dividend(date(2025, 7, 8), D("0.015895"), [KONTR])
    )


def test_infer_restated_from_finds_the_drop():
    assert infer_restated_from(YAHOO_FULL, EX, F) == date(2025, 12, 1)
    # Real (unrestated) closes have no drop of about F.
    assert infer_restated_from({date(2025, 11, 28): D("33.40")} | REAL, EX, F) is None


def test_factors_of_several_issues_compound():
    later = RightsIssue("KONTR.IS", date(2026, 6, 1), D(2))
    corrected = correct_closes({date(2025, 12, 1): D(10)}, [KONTR, later])
    assert corrected[date(2025, 12, 1)] == 10 * F * 2


# -- factor inference for manual entries ---------------------------------

def test_infer_factor_when_yahoo_restated():
    factor, certain = infer_price_factor(YAHOO, EX, D(1), D(1))
    assert certain
    assert abs(factor - F) < D("0.000001")


def test_infer_factor_when_yahoo_did_not_restate():
    factor, certain = infer_price_factor(REAL, EX, D(1), D(1))
    assert (factor, certain) == (D(1), True)


def test_infer_factor_before_ex_date_data_exists():
    pre_only = {d: c for d, c in YAHOO.items() if d < EX}
    assert infer_price_factor(pre_only, EX, D(1), D(1)) == (D(1), False)


# -- detection during sync -----------------------------------------------

def test_detect_with_stored_data_on_both_sides():
    """Stored copy reaches past the ex-date (Yahoo restated late)."""
    detection = detect_restatement(REAL, YAHOO, fresh_splits={})
    assert detection is not None
    assert detection.exact
    assert detection.ex_date == EX
    assert abs(detection.factor - F) < D("0.001")


def test_detect_restated_run_after_unchanged_days():
    """Yahoo restates only the days before the ex-date; older closes match."""
    stored = {date(2025, 11, 28): D("33.40")} | REAL
    detection = detect_restatement(stored, YAHOO_FULL, fresh_splits={})
    assert detection is not None
    assert detection.exact
    assert detection.ex_date == EX
    assert detection.restated_from == date(2025, 12, 1)


def test_detect_when_stored_copy_ends_before_ex_date():
    """Last sync on Dec 6: stored has real closes through Dec 5 only."""
    stored = {d: c for d, c in REAL.items() if d <= date(2025, 12, 5)}
    detection = detect_restatement(stored, YAHOO, fresh_splits={})
    assert detection is not None
    assert not detection.exact
    assert detection.ex_date == EX  # estimated from the 0.01 price tick
    assert abs(detection.factor - F) < D("0.001")


def test_split_is_not_mistaken_for_rights_issue():
    stored = {d: c * 2 for d, c in REAL.items() if d < EX} | {
        d: c for d, c in REAL.items() if d >= EX
    }
    detection = detect_restatement(stored, REAL, fresh_splits={EX: D(2)})
    assert detection is None


def test_ordinary_revisions_are_ignored():
    stored = dict(YAHOO)
    stored[date(2025, 12, 3)] = YAHOO[date(2025, 12, 3)] * D("1.03")  # one-off fix
    assert detect_restatement(stored, YAHOO, fresh_splits={}) is None


def test_identical_data_is_ignored():
    assert detect_restatement(YAHOO, YAHOO, fresh_splits={}) is None


# -- end to end: what the holder did with the rights ---------------------

DAY_BEFORE = date(2025, 12, 8)
BOUGHT = date(2025, 12, 1)
# Yahoo after restating; on the ex-date the stock opens and closes exactly at
# the theoretical price, so any change in total P/L is accounting, not market.
YAHOO_AT_THEORY = {BOUGHT: D("17.181393"), DAY_BEFORE: D("15.58"), EX: D("15.58")}
BUY_100 = LedgerTransaction(BOUGHT, "KONTR.IS", "buy", D(100), D("33.26"))
RIGHTS_VALUE = 100 * (D("15.58") - 1)  # 100 rights × (theoretical − 1 TL)


def _pl_before_and_on_ex_date(extra: list[LedgerTransaction]) -> tuple[float, float]:
    closes = {"KONTR.IS": correct_closes(YAHOO_AT_THEORY, [KONTR])}
    series = build_daily_series(
        [BUY_100, *extra], closes, [], sorted(YAHOO_AT_THEORY), as_of=EX
    )
    by_date = {p["date"]: p["total_pl"] for p in series["points"]}
    return by_date[DAY_BEFORE.isoformat()], by_date[EX.isoformat()]


def test_bought_price_matches_corrected_close():
    before, _ = _pl_before_and_on_ex_date([])
    assert before == float(100 * (D("30.16") - D("33.26")))  # real −310 TL, not −1,768


def test_exercising_rights_keeps_pl_continuous():
    exercise = LedgerTransaction(EX, "KONTR.IS", "buy", D(100), D(1))
    before, on_ex = _pl_before_and_on_ex_date([exercise])
    assert before == on_ex


def test_selling_rights_keeps_pl_continuous_and_is_realized():
    sale = LedgerTransaction(EX, "KONTR.IS", "rights_sale", D(100), D("14.58"))
    before, on_ex = _pl_before_and_on_ex_date([sale])
    assert before == on_ex

    position = replay([BUY_100, sale], []).positions["KONTR.IS"]
    assert position.quantity == 100  # selling rights does not sell shares
    assert position.realized_pl == D("1458")


def test_letting_rights_lapse_loses_their_value():
    before, on_ex = _pl_before_and_on_ex_date([])
    assert round(before - on_ex, 2) == float(RIGHTS_VALUE)
