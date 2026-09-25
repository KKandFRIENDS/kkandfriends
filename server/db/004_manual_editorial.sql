begin;

create or replace function public.editorial_manual_create(
  p_date date,
  p_payload jsonb,
  p_hash text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d editorial_drafts; new_id text;
begin
  if p_payload is null or p_hash is null or length(p_hash) <> 64 then
    raise exception 'Invalid manual draft';
  end if;
  new_id := p_date::text || '-' || (p_payload->'desk'->>'id');
  insert into editorial_drafts(id,edition_date,status,payload,content_hash)
    values(new_id,p_date,'awaiting_approval',p_payload,p_hash)
    returning * into d;
  insert into editorial_events(draft_id,action,version,snapshot)
    values(d.id,'created_manual',d.version,to_jsonb(d));
  return to_jsonb(d);
end; $$;

revoke all on function public.editorial_manual_create(date,jsonb,text) from public;

commit;
