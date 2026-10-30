-- Experimental portfolios: the user can mark a portfolio as a trial
-- (paper trading, a strategy test). Such portfolios keep their own
-- analysis but are left out of the combined Overview page.
-- The owner's existing update policy already covers the new column.
alter table public.portfolios
    add column is_experimental boolean not null default false;
