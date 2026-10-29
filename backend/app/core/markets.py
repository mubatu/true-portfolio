from dataclasses import dataclass
from datetime import date
from decimal import Decimal


@dataclass(frozen=True)
class MarketConfig:
    code: str
    currency: str
    country: str
    yfinance_suffix: str
    benchmark_candidates: tuple[str, ...]
    # Cash-dividend withholding tax as ``(effective_from, rate)`` pairs,
    # sorted by date. The rate in force on a dividend's ex-date applies.
    dividend_withholding: tuple[tuple[date, Decimal], ...] = ()


# Central backend market registry.
# Add new markets here (e.g. NYSE/NASDAQ) with benchmark candidates
# that represent exchange open days on yfinance.
MARKETS: dict[str, MarketConfig] = {
    "BIST": MarketConfig(
        code="BIST",
        currency="TRY",
        country="TR",
        yfinance_suffix=".IS",
        benchmark_candidates=("XU100.IS", "^XU100"),
        # Stopaj for resident individuals (GVK md. 94/6-b-i):
        #   15% → 10% by Presidential Decree 4936 (22 Dec 2021)
        #   10% → 15% by Presidential Decree 9286 (22 Dec 2024)
        dividend_withholding=(
            (date.min, Decimal("0.15")),
            (date(2021, 12, 22), Decimal("0.10")),
            (date(2024, 12, 22), Decimal("0.15")),
        ),
    ),
}


def get_market_config(market_code: str | None) -> MarketConfig | None:
    if not market_code:
        return None
    return MARKETS.get(market_code.upper())


def get_market_benchmark_candidates(market_code: str | None) -> tuple[str, ...]:
    config = get_market_config(market_code)
    if config is None:
        return ()
    return config.benchmark_candidates


def get_dividend_withholding_rate(market_code: str | None, ex_date: date) -> Decimal:
    """Withholding rate applied to a cash dividend with the given ex-date."""
    config = get_market_config(market_code)
    if config is None:
        return Decimal(0)

    rate = Decimal(0)
    for effective_from, period_rate in config.dividend_withholding:
        if ex_date >= effective_from:
            rate = period_rate
    return rate
