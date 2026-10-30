-- Split corrections. Yahoo sometimes reports a wrong split ratio while its
-- price history uses the right one, or adjusts only the last few closes
-- before a split; corporate_actions and market_prices are rewritten from
-- Yahoo on every sync, so corrections live here and are applied when
-- reading (see backend/app/services/market_data.py).
-- Shared per ticker like the other market-data tables: backend-only, RLS on
-- without policies.
create table public.split_corrections (
    ticker text not null,
    -- Ex-date of the split; replaces Yahoo's split on this date, or adds one.
    date date not null,
    -- Shares after per share before (2 = 1 share → 2).
    ratio numeric not null,
    -- First close Yahoo adjusted for this split when it left older closes in
    -- the pre-split basis; closes before it are divided by ratio on read.
    -- Null = Yahoo adjusted the whole history.
    adjusted_from date,
    note text,
    created_at timestamptz not null default now(),
    constraint split_corrections_pkey primary key (ticker, date),
    constraint split_corrections_ratio_check check (ratio > 0)
);

alter table public.split_corrections enable row level security;

-- TNZTP 2025 bedelsiz %70,7024 (broker statement: 300 lots received 212,107).
-- Yahoo reports 763587.12.
insert into public.split_corrections (ticker, date, ratio, note)
values ('TNZTP.IS', '2025-03-06', 1.707024, 'Yahoo reports 763587.12; bedelsiz %70,7024');

-- EUREN 2024 bedelsiz: Yahoo adjusted only 02–04.12.2024 (off-tick closes);
-- 29.11.2024 and earlier are still real pre-split prices (~11 TL).
insert into public.split_corrections (ticker, date, ratio, adjusted_from, note)
values ('EUREN.IS', '2024-12-05', 2.7631577, '2024-12-02', 'Yahoo left closes before 02.12.2024 unadjusted');
