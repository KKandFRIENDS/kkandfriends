-- ============================================================================
--  kkandfriends.com — Member nominations (peer invites). Phase 4 / growth.
--  Run ONCE in the Supabase SQL editor, after 002_members.sql.
--
--  Approved members nominate a peer they'd vouch for; each nomination lands in
--  an admin-only review queue where KK marks it contacted / joined / declined.
--  This keeps admission gated (KK still decides) while turning the membership
--  into the growth engine — the exclusivity stays intact.
--
--  A member sees only their OWN nominations (to avoid a public "who nominated
--  whom" leak); the admin sees all. Status/notes are admin-only writes.
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.nominations (
  id              uuid primary key default gen_random_uuid(),
  nominator_id    uuid not null references auth.users(id) on delete cascade,
  nominee_name    text not null check (char_length(nominee_name) between 1 and 120),
  nominee_contact text check (nominee_contact is null or char_length(nominee_contact) <= 200),
  field           text check (field is null or char_length(field) <= 80),
  reason          text not null check (char_length(reason) between 1 and 2000),
  status          text not null default 'new'
                    check (status in ('new','contacted','joined','declined')),
  admin_note      text check (admin_note is null or char_length(admin_note) <= 2000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists nominations_status_idx on public.nominations (status, created_at desc);
create index if not exists nominations_nominator_idx on public.nominations (nominator_id, created_at desc);

alter table public.nominations enable row level security;

-- INSERT: an approved member nominates as themselves; status starts at 'new'
--         (a member cannot pre-mark a nominee as joined).
drop policy if exists nominations_insert on public.nominations;
create policy nominations_insert on public.nominations
  for insert to authenticated
  with check (nominator_id = auth.uid() and public.is_member() and status = 'new');

-- SELECT: the nominator reads their own; the admin reads the whole queue.
drop policy if exists nominations_select on public.nominations;
create policy nominations_select on public.nominations
  for select to authenticated
  using (nominator_id = auth.uid() or public.is_admin());

-- UPDATE / DELETE: admin only (moves items through the queue).
drop policy if exists nominations_update on public.nominations;
create policy nominations_update on public.nominations
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists nominations_delete on public.nominations;
create policy nominations_delete on public.nominations
  for delete to authenticated using (public.is_admin());

-- Column GRANTs: members may write only the fields the form collects. status
-- and admin_note are never client-writable by a member — even the nominator —
-- so the queue state is fully admin-controlled (admin bypasses column grants).
revoke all on public.nominations from authenticated;
grant select on public.nominations to authenticated;
grant insert (nominator_id, nominee_name, nominee_contact, field, reason) on public.nominations to authenticated;

-- keep updated_at honest (touch_updated_at() defined in 002)
drop trigger if exists nominations_touch_updated_at on public.nominations;
create trigger nominations_touch_updated_at
  before update on public.nominations
  for each row execute function public.touch_updated_at();
