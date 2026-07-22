-- ============================================================================
--  kkandfriends.com — Light moderation: content reports. Phase 3.
--  Run ONCE in the Supabase SQL editor, after 004_member_posts.sql.
--
--  Approved members can flag a post (신고); the admin reviews a queue and can hide
--  the content and resolve/dismiss the report. Members never see others' reports.
--  target_type allows 'comment' too, for a future comment-report follow-up.
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment')),
  target_id   uuid not null,
  reason      text check (reason is null or char_length(reason) <= 1000),
  status      text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;

-- INSERT: an approved member files a report as themselves.
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid() and public.is_member());

-- SELECT / UPDATE / DELETE: admin only (the review queue).
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated using (public.is_admin());

drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists reports_delete on public.reports;
create policy reports_delete on public.reports
  for delete to authenticated using (public.is_admin());
