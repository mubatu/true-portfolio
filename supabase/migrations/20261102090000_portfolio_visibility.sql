-- Public portfolios: shown on the Explore page to everyone, signed in or
-- not. Only percentages leave the server (the backend's /api/explore
-- endpoints strip every amount); transactions and profiles stay private,
-- so the existing owner-only RLS policies are unchanged.
alter table public.portfolios
    add column is_public boolean not null default false;

create index portfolios_public_idx on public.portfolios (id) where is_public;
