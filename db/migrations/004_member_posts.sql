-- ============================================================================
--  kkandfriends.com — Member posts ("Friends' Voices"). Phase 2.
--  Run ONCE in the Supabase SQL editor, after 002_members.sql.
--
--  Product rules (chosen 2026-07-21):
--    • Visibility: MEMBERS ONLY. Published member posts are readable only by
--      approved members (and the admin). KK's own THOUGHTS stay public and are
--      NOT in this table.
--    • Publishing: INSTANT. An approved member's post goes live the moment they
--      publish; no per-post review queue. The admin can hide/remove anything.
--
--  Same trust model as 001/002: public site, anon key, everything enforced by
--  RLS + is_member()/is_admin() (both defined in earlier migrations).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
--  member_posts — one row per member-authored post. Body is Markdown, rendered
--  client-side by a safe (HTML-escaping) renderer — never store or trust HTML.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.member_posts (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references auth.users(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  body         text not null check (char_length(body) between 1 and 100000),
  category     text,
  status       text not null default 'draft' check (status in ('draft','published')),
  is_hidden    boolean not null default false,   -- admin moderation (soft)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists member_posts_feed_idx
  on public.member_posts (status, is_hidden, published_at desc);
create index if not exists member_posts_author_idx
  on public.member_posts (author_id, created_at desc);

-- keep updated_at honest (touch_updated_at() defined in 002)
drop trigger if exists member_posts_touch_updated_at on public.member_posts;
create trigger member_posts_touch_updated_at
  before update on public.member_posts
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
--  RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.member_posts enable row level security;

-- READ: an approved member may read any published, non-hidden post; an author
--       may always read their own (incl. drafts / hidden); admin reads all.
drop policy if exists member_posts_select on public.member_posts;
create policy member_posts_select on public.member_posts
  for select to authenticated
  using (
    (status = 'published' and is_hidden = false and public.is_member())
    or author_id = auth.uid()
    or public.is_admin()
  );

-- INSERT: only an approved member, writing as themselves.
drop policy if exists member_posts_insert on public.member_posts;
create policy member_posts_insert on public.member_posts
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_member());

-- UPDATE (row scope): author edits own; admin any. Column GRANTs below stop a
--       member from flipping is_hidden (that's admin-only, via the RPC).
drop policy if exists member_posts_update on public.member_posts;
create policy member_posts_update on public.member_posts
  for update to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

-- DELETE: author removes own; admin any.
drop policy if exists member_posts_delete on public.member_posts;
create policy member_posts_delete on public.member_posts
  for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- Column-level: members may write only their own content columns.
revoke update on public.member_posts from authenticated;
grant  update (title, body, category, status, published_at)
  on public.member_posts to authenticated;

-- Admin moderation — the only way is_hidden changes.
create or replace function public.set_post_hidden(target uuid, val boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.member_posts set is_hidden = val where id = target;
end; $$;
grant execute on function public.set_post_hidden(uuid, boolean) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
--  Comments on member posts are members-only too.
--  The discussion module (001) stores comments by post_slug and its SELECT/INSERT
--  policies are public (fine for KK's public THOUGHTS). Member-post discussions
--  use slugs of the form 'member:<uuid>'. Re-scope just those so they require an
--  approved member — public post_slugs keep their existing public behaviour.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to public
  using (
    author_id = auth.uid()
    or public.is_admin()
    or (
      is_hidden = false
      and (post_slug not like 'member:%' or public.is_member())
    )
  );

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated
  with check (
    auth.uid() = author_id
    and (post_slug not like 'member:%' or public.is_member())
  );

-- ─────────────────────────────────────────────────────────────────────────────
--  public_member_profiles — a SAFE, read-only subset of approved members'
--  profiles, so members can see each other's byline (name / field / founding
--  badge) on posts and, later, in a directory — WITHOUT exposing private fields
--  (real_name, contact_email, note_to_admin). The base profiles table stays
--  self+admin-only (002). This view runs with definer rights, so it exposes ONLY
--  the columns selected here; affiliation appears only when the member opted in.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.public_member_profiles as
  select
    id,
    display_name,
    identity_mode,
    field,
    avatar_url,
    is_founding,
    case when show_affiliation then affiliation else null end as affiliation
  from public.profiles
  where status = 'approved';

grant select on public.public_member_profiles to authenticated;
