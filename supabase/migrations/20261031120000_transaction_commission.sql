-- Broker commission per transaction, as a fraction of quantity × price
-- (0.0002 = on binde 2 = 0.02%). Entered by the user per trade; existing
-- trades get the default. The backend adds it to the cost of buys and
-- deducts it from the proceeds of sells and rights sales.
alter table public.transactions
    add column commission_rate numeric not null default 0.0002;

alter table public.transactions
    add constraint transactions_commission_rate_check
    check (commission_rate >= 0 and commission_rate < 0.1);
