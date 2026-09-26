begin;

create extension if not exists pgcrypto;

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Better Auth owns its own user/session/account tables. Application user ids
-- are text so an exported Supabase UUID can be retained verbatim during import.
create table if not exists profiles (
  id text primary key,
  contact_email text,
  avatar_url text,
  display_name text,
  identity_mode text not null default 'pseudonym' check (identity_mode in ('real','pseudonym')),
  real_name text,
  affiliation text,
  show_affiliation boolean not null default false,
  field text,
  career_summary text check (career_summary is null or char_length(career_summary) <= 1000),
  note_to_admin text check (note_to_admin is null or char_length(note_to_admin) <= 2000),
  status text not null default 'pending' check (status in ('pending','approved','declined','suspended')),
  is_founding boolean not null default false,
  onboarded boolean not null default false,
  digest_opt_in boolean not null default true,
  daily_brief_optin boolean not null default true,
  unsub_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);
create index if not exists profiles_status_idx on profiles (status, created_at);
drop trigger if exists profiles_touch_updated_at on profiles;
create trigger profiles_touch_updated_at before update on profiles
for each row execute function touch_updated_at();

create table if not exists member_posts (
  id uuid primary key default gen_random_uuid(),
  author_id text not null references profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 100000),
  category text,
  status text not null default 'draft' check (status in ('draft','published')),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists member_posts_feed_idx on member_posts (status, is_hidden, published_at desc);
create index if not exists member_posts_author_idx on member_posts (author_id, created_at desc);
drop trigger if exists member_posts_touch_updated_at on member_posts;
create trigger member_posts_touch_updated_at before update on member_posts
for each row execute function touch_updated_at();

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  post_slug text not null,
  parent_id uuid references comments(id) on delete cascade,
  author_id text not null references profiles(id) on delete cascade,
  author_name text,
  author_avatar_url text,
  body text not null check (char_length(body) between 1 and 2000),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists comments_post_slug_idx on comments (post_slug, created_at);
create index if not exists comments_parent_id_idx on comments (parent_id);

create table if not exists comment_likes (
  comment_id uuid not null references comments(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table if not exists post_likes (
  post_slug text not null,
  user_id text not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_slug, user_id)
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(id) on delete cascade,
  actor_id text references profiles(id) on delete set null,
  actor_name text,
  type text not null check (type in ('comment','reply','post_like','comment_like','daily_brief','korea_close')),
  member_post_id uuid references member_posts(id) on delete cascade,
  comment_id uuid references comments(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, is_read, created_at desc);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 5000),
  event_at timestamptz not null,
  location text,
  capacity integer check (capacity is null or capacity > 0),
  is_cancelled boolean not null default false,
  created_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists events_when_idx on events (event_at);
drop trigger if exists events_touch_updated_at on events;
create trigger events_touch_updated_at before update on events
for each row execute function touch_updated_at();

create table if not exists event_rsvps (
  event_id uuid not null references events(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id text not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment')),
  target_id uuid not null,
  reason text check (reason is null or char_length(reason) <= 1000),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists reports_status_idx on reports (status, created_at desc);

create table if not exists nominations (
  id uuid primary key default gen_random_uuid(),
  nominator_id text not null references profiles(id) on delete cascade,
  nominee_name text not null check (char_length(nominee_name) between 1 and 120),
  nominee_contact text check (nominee_contact is null or char_length(nominee_contact) <= 200),
  field text check (field is null or char_length(field) <= 80),
  reason text not null check (char_length(reason) between 1 and 2000),
  status text not null default 'new' check (status in ('new','contacted','joined','declined')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists nominations_status_idx on nominations (status, created_at desc);
create index if not exists nominations_nominator_idx on nominations (nominator_id, created_at desc);
drop trigger if exists nominations_touch_updated_at on nominations;
create trigger nominations_touch_updated_at before update on nominations
for each row execute function touch_updated_at();

create table if not exists daily_briefs (
  brief_date date not null,
  kind text not null default 'global' check (kind in ('global','korea_close')),
  post_id uuid references member_posts(id) on delete set null,
  status text not null default 'running' check (status in ('running','published','failed')),
  notified integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (brief_date, kind)
);

create table if not exists editorial_runs (
  edition_date date primary key,
  status text not null check (status in ('running','ready','failed')),
  attempt uuid not null,
  lease_until timestamptz not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  detail jsonb not null default '{}'
);
create table if not exists editorial_drafts (
  id text primary key,
  edition_date date not null unique,
  status text not null default 'awaiting_approval' check (status in ('awaiting_approval','approved','rejected','published')),
  version integer not null default 1,
  payload jsonb not null,
  content_hash text not null,
  approved_hash text,
  approved_at timestamptz,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists editorial_events (
  id bigint generated always as identity primary key,
  draft_id text not null references editorial_drafts(id),
  action text not null,
  version integer not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists kk_original_posts (
  id uuid primary key default gen_random_uuid(),
  created_by text not null references profiles(id),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 200),
  summary text not null check (char_length(summary) between 1 and 500),
  body text not null check (char_length(body) between 1 and 100000),
  category text not null check (category in ('Macro','Korea','Equity','Digital Assets','Global','Manifesto')),
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  check (status <> 'published' or published_at is not null)
);
create index if not exists kk_original_posts_public_idx on kk_original_posts (published_at desc) where status = 'published';
drop trigger if exists kk_original_posts_touch_updated_at on kk_original_posts;
create trigger kk_original_posts_touch_updated_at before update on kk_original_posts
for each row execute function touch_updated_at();

commit;
