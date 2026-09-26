-- 005_newsletter_opt_in.sql
-- Member opt-in for the Stibee newsletter (/me checkbox).
-- Default false: members joined for review and community access, not for the
-- newsletter, so nobody is enrolled until they tick the box themselves.
-- Run once against the existing VPS database; fresh installs get the column
-- from 001_app_schema.sql. Safe to re-run.

begin;

alter table profiles
  add column if not exists newsletter_opt_in boolean not null default false;

commit;
