-- ============================================================================
--  kkandfriends.com — Events (offline meetups) + RSVPs. Phase 3.
--  Run ONCE in the Supabase SQL editor, after 002_members.sql.
--
--  • Events are created/edited/cancelled by the admin (KK).
--  • Approved members can see events and RSVP (going). Attendee lists are visible
--    to members so people know who's coming.
--  Members-only, same anon-key + RLS model.
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 200),
  description  text check (description is null or char_length(description) <= 5000),
  event_at     timestamptz not null,
  location     text,
  capacity     integer check (capacity is null or capacity > 0),
  is_cancelled boolean not null default false,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists events_when_idx on public.events (event_at);

create table if not exists public.event_rsvps (
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_rsvps_event_idx on public.event_rsvps (event_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.events      enable row level security;
alter table public.event_rsvps enable row level security;

-- events: members + admin read; admin writes.
drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select to authenticated using (public.is_member() or public.is_admin());

drop policy if exists events_insert on public.events;
create policy events_insert on public.events
  for insert to authenticated with check (public.is_admin());

drop policy if exists events_update on public.events;
create policy events_update on public.events
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists events_delete on public.events;
create policy events_delete on public.events
  for delete to authenticated using (public.is_admin());

-- rsvps: members + admin read (attendee lists); a member manages only their own.
drop policy if exists event_rsvps_select on public.event_rsvps;
create policy event_rsvps_select on public.event_rsvps
  for select to authenticated using (public.is_member() or public.is_admin());

drop policy if exists event_rsvps_insert on public.event_rsvps;
create policy event_rsvps_insert on public.event_rsvps
  for insert to authenticated
  with check (auth.uid() = user_id and (public.is_member() or public.is_admin()));

drop policy if exists event_rsvps_delete on public.event_rsvps;
create policy event_rsvps_delete on public.event_rsvps
  for delete to authenticated using (auth.uid() = user_id or public.is_admin());
