-- KK ORIGINAL owner-written posts.
-- Run once after 001_comments.sql (is_admin) and 002_members.sql
-- (touch_updated_at). Public readers may see published rows only; every write
-- is guarded by is_admin() in PostgreSQL, not by the browser UI.

create table if not exists public.kk_original_posts (
  id           uuid primary key default gen_random_uuid(),
  created_by   uuid not null references auth.users(id),
  slug         text not null unique
                 check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title        text not null check (char_length(title) between 1 and 200),
  summary      text not null check (char_length(summary) between 1 and 500),
  body         text not null check (char_length(body) between 1 and 100000),
  category     text not null check (category in
                 ('Macro','Korea','Equity','Digital Assets','Global','Manifesto')),
  status       text not null default 'draft'
                 check (status in ('draft','published')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz,
  check (status <> 'published' or published_at is not null)
);

create index if not exists kk_original_posts_public_idx
  on public.kk_original_posts (published_at desc)
  where status = 'published';

drop trigger if exists kk_original_posts_touch_updated_at on public.kk_original_posts;
create trigger kk_original_posts_touch_updated_at
  before update on public.kk_original_posts
  for each row execute function public.touch_updated_at();

alter table public.kk_original_posts enable row level security;

drop policy if exists kk_original_posts_select on public.kk_original_posts;
create policy kk_original_posts_select on public.kk_original_posts
  for select
  using (status = 'published' or public.is_admin());

drop policy if exists kk_original_posts_insert on public.kk_original_posts;
create policy kk_original_posts_insert on public.kk_original_posts
  for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());

drop policy if exists kk_original_posts_update on public.kk_original_posts;
create policy kk_original_posts_update on public.kk_original_posts
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.kk_original_posts from anon, authenticated;
grant select on public.kk_original_posts to anon, authenticated;
grant insert, update on public.kk_original_posts to authenticated;

-- The shared public image bucket normally accepts approved members. Ensure the
-- owner can upload article images even if the profile row is not a member row.
drop policy if exists post_images_admin_insert on storage.objects;
create policy post_images_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-images' and public.is_admin());

