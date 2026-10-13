-- 2026-10-13: KK ORIGINAL gets an "AI" category (the #AI stream replaced #geopolitics on 2026-08-02).
-- Safe to run twice: the old check is dropped by name and recreated with the new list.
begin;
alter table kk_original_posts drop constraint if exists kk_original_posts_category_check;
alter table kk_original_posts add constraint kk_original_posts_category_check
  check (category in ('Macro','Korea','Equity','Digital Assets','AI','Global','Manifesto'));
commit;
