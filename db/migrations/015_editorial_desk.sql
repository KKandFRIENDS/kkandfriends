-- Apply after existing membership migrations. Service-only storage and RPCs.
-- Additive: no existing articles, schedules, or member data are modified.
begin;
create table if not exists public.editorial_runs (
  edition_date date primary key,
  status text not null check (status in ('running','ready','failed')),
  attempt uuid not null,
  lease_until timestamptz not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  detail jsonb not null default '{}'
);
create table if not exists public.editorial_drafts (
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
create table if not exists public.editorial_events (
  id bigint generated always as identity primary key,
  draft_id text not null references public.editorial_drafts(id),
  action text not null,
  version integer not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.editorial_runs enable row level security;
alter table public.editorial_drafts enable row level security;
alter table public.editorial_events enable row level security;
revoke all on public.editorial_runs, public.editorial_drafts, public.editorial_events from anon, authenticated;
grant all on public.editorial_runs, public.editorial_drafts, public.editorial_events to service_role;
grant usage, select on sequence public.editorial_events_id_seq to service_role;

create or replace function public.editorial_claim(p_date date, p_attempt uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed date;
begin
  insert into editorial_runs(edition_date,status,attempt,lease_until)
  values(p_date,'running',p_attempt,now()+interval '90 minutes')
  on conflict(edition_date) do update set status='running',attempt=p_attempt,
    lease_until=now()+interval '90 minutes',started_at=now(),finished_at=null,detail='{}'
  where editorial_runs.status='failed' or (editorial_runs.status='running' and editorial_runs.lease_until<now())
  returning edition_date into claimed;
  return claimed is not null;
end; $$;

create or replace function public.editorial_finish(p_date date, p_attempt uuid, p_payload jsonb, p_hash text, p_detail jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare r editorial_runs; d editorial_drafts; new_id text;
begin
  select * into r from editorial_runs where edition_date=p_date for update;
  if not found or r.attempt<>p_attempt or r.status<>'running' or r.lease_until<now() then raise exception 'Lost run lease'; end if;
  if p_payload is not null then
    new_id := p_date::text || '-' || (p_payload->'desk'->>'id');
    insert into editorial_drafts(id,edition_date,payload,content_hash)
      values(new_id,p_date,p_payload,p_hash) returning * into d;
    insert into editorial_events(draft_id,action,version,snapshot) values(d.id,'created',d.version,to_jsonb(d));
  end if;
  update editorial_runs set status=case when p_payload is null then 'failed' else 'ready' end,
    finished_at=now(),detail=p_detail where edition_date=p_date;
  return true;
end; $$;

create or replace function public.editorial_transition(p_id text,p_version integer,p_action text,p_payload jsonb,p_hash text,p_reviewed boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d editorial_drafts;
begin
  select * into d from editorial_drafts where id=p_id for update;
  if not found or d.version<>p_version then raise exception 'Stale draft'; end if;
  if d.status='published' then raise exception 'Published edition is immutable'; end if;
  if p_action='revise' then
    d.payload:=p_payload; d.content_hash:=p_hash; d.status:='awaiting_approval';
    d.approved_hash:=null; d.approved_at:=null;
  elsif p_action='approve' then
    if d.status<>'awaiting_approval' or not p_reviewed or p_hash<>d.content_hash then raise exception 'Review required'; end if;
    d.status:='approved'; d.approved_hash:=d.content_hash; d.approved_at:=now();
  elsif p_action='reject' then
    if d.status not in ('awaiting_approval','approved') then raise exception 'Invalid rejection'; end if;
    d.status:='rejected'; d.approved_hash:=null; d.approved_at:=null;
  elsif p_action='publish' then
    if d.status<>'approved' or d.approved_hash is distinct from d.content_hash or p_hash<>d.content_hash then raise exception 'Approval mismatch'; end if;
    d.status:='published'; d.published_at:=now();
  else raise exception 'Unknown action'; end if;
  d.version:=d.version+1; d.updated_at:=now();
  update editorial_drafts set payload=d.payload,status=d.status,content_hash=d.content_hash,
    approved_hash=d.approved_hash,approved_at=d.approved_at,published_at=d.published_at,
    version=d.version,updated_at=d.updated_at where id=p_id;
  insert into editorial_events(draft_id,action,version,snapshot) values(p_id,p_action,d.version,to_jsonb(d));
  return to_jsonb(d);
end; $$;
revoke all on function public.editorial_claim(date,uuid), public.editorial_finish(date,uuid,jsonb,text,jsonb), public.editorial_transition(text,integer,text,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.editorial_claim(date,uuid), public.editorial_finish(date,uuid,jsonb,text,jsonb), public.editorial_transition(text,integer,text,jsonb,text,boolean) to service_role;
commit;
