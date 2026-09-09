begin;
create or replace function public.editorial_renew(p_date date, p_attempt uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare renewed date;
begin
  update editorial_runs set lease_until=now()+interval '90 minutes'
  where edition_date=p_date and attempt=p_attempt and status='running' and lease_until>=now()
  returning edition_date into renewed;
  return renewed is not null;
end; $$;
revoke all on function public.editorial_renew(date,uuid) from public,anon,authenticated;
grant execute on function public.editorial_renew(date,uuid) to service_role;
commit;
