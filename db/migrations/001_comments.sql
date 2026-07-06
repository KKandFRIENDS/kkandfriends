-- ============================================================================
--  kkandfriends.com — Discussion module schema + Row Level Security (RLS)
--  Run this ONCE in the Supabase SQL editor (see SETUP.md, step 2).
--
--  Security model: this database is reached from a PUBLIC static site using the
--  anon public key. Nothing below trusts the client. Every read/write is gated
--  by the RLS policies at the bottom of this file. Never expose service_role.
-- ============================================================================

create extension if not exists "pgcrypto";   -- for gen_random_uuid()

-- ─────────────────────────────────────────────────────────────────────────────
--  Admin helper — the ONE place you name the owner's UID.
--  After your first Google sign-in (SETUP.md step 4), replace the zero-UID
--  below with your real auth UID and re-run just this function.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select auth.uid() = '6ac6cf72-1c88-4626-9124-27a6a2792e1e'::uuid;  -- ADMIN_UID_HERE
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  Tables
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.comments (
  id                uuid primary key default gen_random_uuid(),
  post_slug         text not null,
  parent_id         uuid references public.comments(id) on delete cascade,
  author_id         uuid not null references auth.users(id) on delete cascade,
  author_name       text,
  author_avatar_url text,
  body              text not null check (char_length(body) between 1 and 2000),
  is_hidden         boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists comments_post_slug_idx on public.comments (post_slug, created_at);
create index if not exists comments_parent_id_idx on public.comments (parent_id);

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table if not exists public.post_likes (
  post_slug  text not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_slug, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
--  Enable RLS (deny-by-default until policies below grant access)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.comments      enable row level security;
alter table public.comment_likes enable row level security;
alter table public.post_likes    enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
--  comments policies
-- ─────────────────────────────────────────────────────────────────────────────
-- READ: anyone (incl. logged-out) may read non-hidden comments.
--       Authors can still see their own hidden ones; admin sees everything.
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to public
  using (is_hidden = false or public.is_admin() or author_id = auth.uid());

-- INSERT: only signed-in users, and only as themselves.
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated
  with check (auth.uid() = author_id);

-- UPDATE: only the admin (used for hiding). Authors don't edit bodies in v1.
drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- DELETE: a user may delete their own comment; admin may delete any.
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
--  comment_likes policies
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists comment_likes_select on public.comment_likes;
create policy comment_likes_select on public.comment_likes
  for select to public using (true);

drop policy if exists comment_likes_insert on public.comment_likes;
create policy comment_likes_insert on public.comment_likes
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists comment_likes_delete on public.comment_likes;
create policy comment_likes_delete on public.comment_likes
  for delete to authenticated using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  post_likes policies
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists post_likes_select on public.post_likes;
create policy post_likes_select on public.post_likes
  for select to public using (true);

drop policy if exists post_likes_insert on public.post_likes;
create policy post_likes_insert on public.post_likes
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists post_likes_delete on public.post_likes;
create policy post_likes_delete on public.post_likes
  for delete to authenticated using (auth.uid() = user_id);

-- ============================================================================
--  v2 TODO (do NOT build now): per-user rate limiting (e.g. max N comments per
--  minute) via a trigger or an edge function. v1 relies on required auth +
--  the client honeypot + the 1–2000 char body constraint above.
-- ============================================================================
