-- Market data is synced from Yahoo at most once per day per ticker and read
-- from the database afterwards. Both tables below are backend-only caches:
-- RLS is enabled without policies, so browsers cannot read or write them.

-- Which date range of a ticker is stored and when it was last refreshed.
-- Every sync re-downloads the whole [covered_from, yesterday] window, so
-- prices and corporate actions of a ticker always share one basis.
create table public.market_data_sync (
    ticker text primary key,
    covered_from date not null,
    covered_through date not null,
    synced_at timestamptz not null default now(),
    constraint market_data_sync_range_check check (covered_from <= covered_through)
);

alter table public.market_data_sync enable row level security;

-- Stock splits and cash dividends, in Yahoo's current share basis.
--   kind = 'split'    → value is the ratio (2 means 1 share became 2)
--   kind = 'dividend' → value is the gross cash amount per share
create table public.corporate_actions (
    ticker text not null,
    date date not null,
    kind text not null,
    value numeric not null,
    constraint corporate_actions_pkey primary key (ticker, date, kind),
    constraint corporate_actions_kind_check check (kind in ('split', 'dividend')),
    constraint corporate_actions_value_check check (value > 0)
);

alter table public.corporate_actions enable row level security;

-- Every analysis reads a portfolio's transactions in date order.
create index if not exists transactions_portfolio_id_date_idx
    on public.transactions using btree (portfolio_id, date, id);
