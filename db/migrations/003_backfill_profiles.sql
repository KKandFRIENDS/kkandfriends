-- ============================================================================
--  kkandfriends.com — Backfill profiles for pre-existing accounts.
--  Run ONCE in the Supabase SQL editor, after 002_members.sql.
--
--  Why: handle_new_user() (in 002) creates a profile automatically when an
--  account signs in for the FIRST time. Accounts that already existed before
--  the member system was added (e.g. the owner, past commenters) never fired
--  that trigger, so they have no profile row. This backfills one pending,
--  not-yet-onboarded profile per existing account. Idempotent and safe to
--  re-run (on conflict do nothing).
-- ============================================================================
insert into public.profiles (id, contact_email, avatar_url, display_name, real_name)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'),
  coalesce(u.raw_user_meta_data->>'full_name',  u.raw_user_meta_data->>'name'),
  coalesce(u.raw_user_meta_data->>'full_name',  u.raw_user_meta_data->>'name')
from auth.users u
on conflict (id) do nothing;
