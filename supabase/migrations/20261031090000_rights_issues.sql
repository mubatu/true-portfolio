-- Rights issues (bedelli sermaye artırımı). Yahoo records no event for
-- them but silently divides earlier closes and dividends by a price factor;
-- the backend multiplies them back (see backend/app/services/rights.py).
-- Shared per ticker like the other market-data tables: backend-only, RLS on
-- without policies.
create table public.rights_issues (
    ticker text not null,
    -- First day the shares trade without the rights (hak kullanım başlangıcı).
    ex_date date not null,
    -- Factor Yahoo applied to closes/dividends before ex_date; 1 = untouched.
    price_factor numeric not null default 1,
    -- New shares per existing share (1 = %100) and price per new share.
    ratio numeric,
    subscription_price numeric,
    -- 'manual' (entered from KAP) or 'detected' (found during a sync).
    source text not null,
    -- Detected with an estimated ex-date, or terms still missing.
    needs_review boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint rights_issues_pkey primary key (ticker, ex_date),
    constraint rights_issues_factor_check check (price_factor > 0),
    constraint rights_issues_ratio_check check (ratio is null or ratio > 0),
    constraint rights_issues_price_check check (subscription_price is null or subscription_price >= 0),
    constraint rights_issues_source_check check (source in ('manual', 'detected'))
);

alter table public.rights_issues enable row level security;
