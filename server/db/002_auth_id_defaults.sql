begin;

alter table "user" alter column id set default gen_random_uuid()::text;
alter table session alter column id set default gen_random_uuid()::text;
alter table account alter column id set default gen_random_uuid()::text;
alter table verification alter column id set default gen_random_uuid()::text;

commit;
