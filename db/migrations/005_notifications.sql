-- ============================================================================
--  kkandfriends.com — On-site notifications. Phase 3.
--  Run ONCE in the Supabase SQL editor, after 004_member_posts.sql.
--
--  A member is notified when someone engages with THEIR content:
--    • comments on their member post          (type 'comment')
--    • replies to their comment                (type 'reply')
--    • likes their member post                 (type 'post_like')
--    • likes their comment                     (type 'comment_like')
--  No broadcast "new post" spam in v1 — the /voices feed already surfaces those,
--  and the weekly email digest (later) is the right place for round-ups.
--
--  Rows are written only by SECURITY DEFINER triggers; clients can read their
--  own and mark them read (nothing else). Same anon-key + RLS trust model.
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,  -- recipient
  type           text not null check (type in ('comment','reply','post_like','comment_like')),
  actor_id       uuid references auth.users(id) on delete set null,
  actor_name     text,                                       -- fallback label
  member_post_id uuid references public.member_posts(id) on delete cascade,  -- link target
  comment_id     uuid references public.comments(id) on delete cascade,
  is_read        boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists notifications_user_idx
  on public.notifications (user_id, is_read, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- Clients may flip only is_read (not forge actor/type/etc.). No INSERT grant:
-- rows come only from the definer triggers below.
revoke insert, update on public.notifications from authenticated, anon;
grant  update (is_read) on public.notifications to authenticated;

-- Helper: member_posts uuid from a 'member:<uuid>' comment slug (null if not one).
create or replace function public.member_post_id_from_slug(slug text)
returns uuid language plpgsql immutable as $$
begin
  if slug like 'member:%' then
    return substring(slug from 8)::uuid;
  end if;
  return null;
exception when others then
  return null;
end; $$;

-- ── comment → notify post author, and (if a reply) the parent comment author ──
create or replace function public.notify_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pid          uuid := public.member_post_id_from_slug(new.post_slug);
  post_author  uuid;
  parent_author uuid;
begin
  if pid is not null then
    select author_id into post_author from public.member_posts where id = pid;
    if post_author is not null and post_author <> new.author_id then
      insert into public.notifications (user_id, type, actor_id, actor_name, member_post_id, comment_id)
      values (post_author, 'comment', new.author_id, new.author_name, pid, new.id);
    end if;
  end if;

  if new.parent_id is not null then
    select author_id into parent_author from public.comments where id = new.parent_id;
    if parent_author is not null
       and parent_author <> new.author_id
       and parent_author is distinct from post_author then
      insert into public.notifications (user_id, type, actor_id, actor_name, member_post_id, comment_id)
      values (parent_author, 'reply', new.author_id, new.author_name, pid, new.id);
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists notify_on_comment on public.comments;
create trigger notify_on_comment
  after insert on public.comments
  for each row execute function public.notify_on_comment();

-- ── post like → notify member-post author ──
create or replace function public.notify_on_post_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pid uuid := public.member_post_id_from_slug(new.post_slug);
  post_author uuid;
begin
  if pid is not null then
    select author_id into post_author from public.member_posts where id = pid;
    if post_author is not null and post_author <> new.user_id then
      insert into public.notifications (user_id, type, actor_id, member_post_id)
      values (post_author, 'post_like', new.user_id, pid);
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists notify_on_post_like on public.post_likes;
create trigger notify_on_post_like
  after insert on public.post_likes
  for each row execute function public.notify_on_post_like();

-- ── comment like → notify comment author ──
create or replace function public.notify_on_comment_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c_author uuid;
  c_slug   text;
  pid      uuid;
begin
  select author_id, post_slug into c_author, c_slug from public.comments where id = new.comment_id;
  if c_author is not null and c_author <> new.user_id then
    pid := public.member_post_id_from_slug(c_slug);
    insert into public.notifications (user_id, type, actor_id, member_post_id, comment_id)
    values (c_author, 'comment_like', new.user_id, pid, new.comment_id);
  end if;
  return new;
end; $$;

drop trigger if exists notify_on_comment_like on public.comment_likes;
create trigger notify_on_comment_like
  after insert on public.comment_likes
  for each row execute function public.notify_on_comment_like();
