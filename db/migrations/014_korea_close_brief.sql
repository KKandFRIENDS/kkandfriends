-- ============================================================================
--  kkandfriends.com — Second daily brief: the Korea market close (17:30 KST).
--  Run ONCE in the Supabase SQL editor, after 012_daily_brief.sql.
--
--  012 locks one brief per KST date (`daily_briefs.brief_date` is the primary
--  key), which is exactly what stops the 07:00 global brief publishing twice.
--  Adding a second daily brief means the lock must be per (date, kind) instead
--  — otherwise the 17:30 Korea brief would collide with that morning's row and
--  silently skip as "already ran today".
--
--  Safe to re-run. Existing rows are backfilled as kind='global'.
-- ============================================================================

-- 1. Add the kind column, defaulting existing rows to the original brief.
alter table public.daily_briefs
  add column if not exists kind text not null default 'global';

alter table public.daily_briefs
  drop constraint if exists daily_briefs_kind_check;
alter table public.daily_briefs
  add constraint daily_briefs_kind_check check (kind in ('global', 'korea_close'));

-- 2. Re-key the lock on (brief_date, kind) so both briefs can run on one day.
--    The old single-column PK is what enforced "one per day"; swap it, don't
--    drop it — the composite key keeps each brief idempotent on its own.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'daily_briefs_pkey' and conrelid = 'public.daily_briefs'::regclass
  ) then
    alter table public.daily_briefs drop constraint daily_briefs_pkey;
  end if;
end $$;

alter table public.daily_briefs
  add primary key (brief_date, kind);

-- 3. Allow the new notification type so the Korea brief can fan out on-site.
--    (005 pinned `type`; 012 widened it once already for daily_brief.)
alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'comment', 'reply', 'post_like', 'comment_like', 'daily_brief', 'korea_close'
  ));
