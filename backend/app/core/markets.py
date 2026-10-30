from dataclasses import dataclass
from datetime import date
from decimal import Decimal


@dataclass(frozen=True)
class MarketConfig:
    code: str
    currency: str
    country: str
    # Ticker suffix: the yfinance exchange suffix, or for uploaded markets
    # just a marker that keeps their codes apart from exchange tickers.
    yfinance_suffix: str
    # Index synced like any holding: its trading days are the market
    # calendar, and its closes are the comparison line.
    benchmark_ticker: str
    # Cash-dividend withholding tax as ``(effective_from, rate)`` pairs,
    # sorted by date. The rate in force on a dividend's ex-date applies.
    dividend_withholding: tuple[tuple[date, Decimal], ...] = ()
    # Yahoo FX quote of the market currency against USD (USD/TRY): drawn as
    # the "dollar" comparison line and used to price gold in that currency.
    usd_ticker: str | None = None
    # "yahoo": synced daily; "upload": prices come only from files the user
    # uploads (TEFAS funds — Yahoo has none and TEFAS blocks automated reads).
    price_source: str = "yahoo"


# Central backend market registry.
# Add new markets here (e.g. NYSE/NASDAQ) with a benchmark index whose
# yfinance history represents the exchange's open days.
MARKETS: dict[str, MarketConfig] = {
    "BIST": MarketConfig(
        code="BIST",
        currency="TRY",
        country="TR",
        yfinance_suffix=".IS",
        benchmark_ticker="XU100.IS",
        usd_ticker="USDTRY=X",
        # Stopaj for resident individuals (GVK md. 94/6-b-i):
        #   15% → 10% by Presidential Decree 4936 (22 Dec 2021)
        #   10% → 15% by Presidential Decree 9286 (22 Dec 2024)
        dividend_withholding=(
            (date.min, Decimal("0.15")),
            (date(2021, 12, 22), Decimal("0.10")),
            (date(2024, 12, 22), Decimal("0.15")),
        ),
    ),
    # TEFAS mutual funds. Prices are uploaded from TEFAS's "Fon Verileri"
    # Excel export; funds pay no cash dividends and never split. Withholding
    # on fund gains (stopaj) is not modelled: returns are before tax.
    "TEFAS": MarketConfig(
        code="TEFAS",
        currency="TRY",
        country="TR",
        yfinance_suffix=".TEFAS",
        benchmark_ticker="XU100.IS",
        usd_ticker="USDTRY=X",
        price_source="upload",
    ),
}


def get_market_config(market_code: str | None) -> MarketConfig | None:
    if not market_code:
        return None
    return MARKETS.get(market_code.upper())


# Gold comparison: Yahoo has no TRY gold quote, so gram gold is derived from
# the front-month COMEX future (USD per troy ounce) and the market's USD rate.
GOLD_USD_TICKER = "GC=F"


def uses_uploaded_prices(ticker: str) -> bool:
    """True for tickers of upload-priced markets: never sent to Yahoo."""
    return any(
        config.price_source == "upload" and ticker.endswith(config.yfinance_suffix)
        for config in MARKETS.values()
    )


def get_market_benchmark(market_code: str | None) -> str | None:
    config = get_market_config(market_code)
    return config.benchmark_ticker if config is not None else None


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
