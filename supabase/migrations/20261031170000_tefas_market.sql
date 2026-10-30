-- TEFAS mutual funds as a portfolio market. Their prices are uploaded from
-- TEFAS's Excel export into market_prices (tickers like 'IPB.TEFAS');
-- Yahoo is never asked for them (see backend/app/core/markets.py).
alter table public.portfolios
    drop constraint portfolios_market_check,
    add constraint portfolios_market_check check (market in ('BIST', 'TEFAS'));
