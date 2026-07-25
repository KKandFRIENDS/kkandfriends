-- ============================================================================
--  kkandfriends.com — Daily global-market brief → lounge + opt-in alerts.
--  Run ONCE in the Supabase SQL editor, after 008_email_digest.sql.
--
--  Every weekday morning (07:00 KST) a Vercel cron function writes a short
--  global-market brief into `member_posts` as KK (admin), then notifies the
--  approved members who opted in. Nothing here sends anything — this migration
--  only adds the preference flag, the notification type, and a per-day lock so
--  the same brief can never be published twice.
--
--  Reuses: profiles (002), member_posts (004), notifications (005).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. Per-member opt-in. Default ON: every approved member gets the brief
--     alert until they turn it off in /me. (Same posture as digest_opt_in.)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists daily_brief_optin boolean not null default true;

-- Let a member toggle only their own preference from /me (column-scoped, so a
-- member still cannot write status / is_founding / etc.).
grant update (daily_brief_optin) on public.profiles to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
--  2. Allow the new notification type. 005 pinned `type` to the four
--     engagement kinds with a CHECK constraint; widen it to include the
--     daily brief broadcast. (Rows are still inserted server-side only —
--     `authenticated`/`anon` have no INSERT grant on notifications.)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('comment','reply','post_like','comment_like','daily_brief'));

-- ─────────────────────────────────────────────────────────────────────────────
--  3. One row per published brief — the idempotency lock.
--     The cron inserts the row FIRST (primary key = the KST date), so a retry,
--     a double cron fire, or a manual test on the same day cannot publish a
--     second brief or double-notify. Touched only by the cron function with the
--     service_role key; RLS on + no policies = invisible to every client.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.daily_briefs (
  brief_date date primary key,                                        -- KST date
  post_id    uuid references public.member_posts(id) on delete set null,
  status     text not null default 'running'
             check (status in ('running','published','failed')),
  notified   integer not null default 0,                              -- recipients
  created_at timestamptz not null default now()
);

alter table public.daily_briefs enable row level security;
revoke all on public.daily_briefs from anon, authenticated;
