-- ============================================================================
--  kkandfriends.com — Weekly email digest support. Phase 3.
--  Run ONCE in the Supabase SQL editor, after 002_members.sql.
--
--  Adds a per-member opt-in flag and a stable unsubscribe token (so a member can
--  turn off the digest from a link in the email, no login needed). The digest
--  itself is sent by a Vercel Cron function using the service_role key server-side
--  (see api/cron/digest.js) — nothing here sends email.
-- ============================================================================

alter table public.profiles
  add column if not exists digest_opt_in boolean not null default true;
alter table public.profiles
  add column if not exists unsub_token uuid not null default gen_random_uuid();

-- Let a member toggle their own digest preference from /me (column-scoped).
grant update (digest_opt_in) on public.profiles to authenticated;

-- One-click unsubscribe by token (no auth). Returns true if a row was updated.
create or replace function public.unsubscribe_digest(token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.profiles set digest_opt_in = false where unsub_token = token;
  get diagnostics n = row_count;
  return n > 0;
end; $$;
grant execute on function public.unsubscribe_digest(uuid) to anon, authenticated;
