-- ============================================================================
--  kkandfriends.com — Membership schema + Row Level Security (RLS)
--  Phase 1. Run this ONCE in the Supabase SQL editor, AFTER 001_comments.sql
--  (this file reuses the public.is_admin() function defined there).
--
--  Security model (same as 001): the site reaches this DB from a PUBLIC static
--  page using the anon key. Nothing here trusts the client. Membership state
--  (status, founding badge) can ONLY be changed by the admin, enforced two ways:
--    1. column-level GRANTs stop members from writing privileged columns, and
--    2. status changes go through SECURITY DEFINER functions guarded by is_admin().
--  Never expose the service_role key.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
--  profiles — one row per account (auth.users). Created automatically by the
--  handle_new_user() trigger on first sign-in; the member then fills in the
--  onboarding fields, and the admin reviews and approves.
--
--  Field visibility:
--    public-facing (chosen identity):  display_name, identity_mode, field,
--                                       career_summary, avatar_url, is_founding
--    semi-private:                      affiliation (+ show_affiliation opt-in)
--    private (member + admin only):     real_name, note_to_admin, contact_email,
--                                       status, timestamps
--  NOTE: in Phase 1, RLS restricts *all* rows to self + admin (no public read).
--  A public-safe view for the member directory / post bylines arrives with
--  Phase 2–3, when member-authored content actually needs it.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  contact_email    text,                                   -- from Google (private)
  avatar_url       text,                                   -- from Google
  display_name     text,                                   -- shown on the site
  identity_mode    text not null default 'pseudonym'
                     check (identity_mode in ('real','pseudonym')),
  real_name        text,                                   -- private, for review
  affiliation      text,                                   -- company/org
  show_affiliation boolean not null default false,         -- display it publicly?
  field            text,                                   -- professional field
  career_summary   text check (career_summary is null or char_length(career_summary) <= 1000),
  note_to_admin    text check (note_to_admin  is null or char_length(note_to_admin)  <= 2000),
  status           text not null default 'pending'
                     check (status in ('pending','approved','declined','suspended')),
  is_founding      boolean not null default false,
  onboarded        boolean not null default false,         -- submitted the form?
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  approved_at      timestamptz
);
create index if not exists profiles_status_idx on public.profiles (status, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
--  is_member() — true when the caller is an approved member. Used by RLS on
--  members-only content (member posts land in Phase 2).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved'
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  handle_new_user() — auto-create a pending profile on first sign-in, seeding
--  the tamper-proof fields (id, email, avatar, name) straight from the auth
--  record. Runs as definer so it bypasses RLS. The member cannot pre-approve
--  themselves: status defaults to 'pending' and is not writable by clients.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, contact_email, avatar_url, display_name, real_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    coalesce(new.raw_user_meta_data->>'full_name',  new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'full_name',  new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
--  touch_updated_at() — keep updated_at honest without granting it to clients.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
--  RLS — deny by default, then grant narrowly.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- READ: a member sees only their own row; the admin sees everyone.
--       (anon has no auth.uid() → sees nothing.)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (auth.uid() = id or public.is_admin());

-- UPDATE (row scope): a member may update only their own row; admin any row.
--       Which *columns* they may write is restricted by the GRANTs below —
--       status / is_founding / approved_at are NOT writable this way.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

-- DELETE: admin only (accounts are normally removed via auth; cascade cleans up).
drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using (public.is_admin());

-- No INSERT policy: profiles are created ONLY by the definer trigger above, so
-- nobody can insert a hand-crafted (e.g. pre-approved) row via the API.

-- ─────────────────────────────────────────────────────────────────────────────
--  Column-level privileges — the second lock on privileged columns.
--  Members may write only their own editable profile fields; status,
--  is_founding, approved_at, and the trigger-managed columns are off-limits.
-- ─────────────────────────────────────────────────────────────────────────────
revoke update on public.profiles from authenticated;
grant  update (
  display_name, identity_mode, real_name, affiliation, show_affiliation,
  field, career_summary, note_to_admin, onboarded
) on public.profiles to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
--  Admin actions — the ONLY way status / founding change. Guarded by is_admin().
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.approve_member(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.profiles
    set status = 'approved', approved_at = coalesce(approved_at, now())
    where id = target;
end; $$;

create or replace function public.decline_member(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.profiles set status = 'declined' where id = target;
end; $$;

create or replace function public.suspend_member(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.profiles set status = 'suspended' where id = target;
end; $$;

create or replace function public.set_founding(target uuid, val boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.profiles set is_founding = val where id = target;
end; $$;

grant execute on function public.approve_member(uuid) to authenticated;
grant execute on function public.decline_member(uuid) to authenticated;
grant execute on function public.suspend_member(uuid) to authenticated;
grant execute on function public.set_founding(uuid, boolean) to authenticated;
grant execute on function public.is_member() to authenticated, anon;

-- ============================================================================
--  Founding cohort / waitlist reconciliation (do later, when KK is ready):
--  the existing Vercel-Postgres waitlist holds pre-launch applicants by email.
--  When one of them signs in with the same Google email, KK can flag them
--  founding from the admin panel (set_founding). A bulk email-match backfill
--  can be scripted once the waitlist is exported. Not automated here.
-- ============================================================================
