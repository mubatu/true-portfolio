-- Yahoo restates only the last few closes (4–7 trading days) before a
-- rights issue's ex-date, not the whole history; dividends are restated in
-- full. restated_from marks the first restated close, so only
-- [restated_from, ex_date) is multiplied back. Null = every close before
-- the ex-date (records made before this column existed).
alter table public.rights_issues
    add column restated_from date;
