-- Keep public.profiles in step with auth.users. handle_new_user copies the
-- name and email only once, at sign-up; a later change (e.g. the profile
-- page's supabase.auth.updateUser({ data: { full_name } })) lives in
-- auth.users.raw_user_meta_data and never reached profiles.
create or replace function public.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    update public.profiles
    set full_name = coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', full_name),
        email = new.email
    where id = new.id;
    return new;
end;
$$;

create trigger on_auth_user_updated
    after update of raw_user_meta_data, email on auth.users
    for each row
    when (
        old.raw_user_meta_data is distinct from new.raw_user_meta_data
        or old.email is distinct from new.email
    )
    execute function public.sync_profile_from_auth();

-- Backfill names and emails changed before this trigger existed.
update public.profiles p
set full_name = coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', p.full_name),
    email = u.email
from auth.users u
where u.id = p.id
  and (
      p.full_name is distinct from coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', p.full_name)
      or p.email is distinct from u.email
  );
