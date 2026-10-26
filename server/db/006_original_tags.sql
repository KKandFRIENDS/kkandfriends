-- 2026-10-26: tags for KK ORIGINAL posts (up to five words per post, used as hashtags when shared).
-- Safe to run twice. Run this BEFORE deploying the API code that reads the column; the old API ignores it.
begin;
alter table kk_original_posts add column if not exists tags text[] not null default '{}';
alter table kk_original_posts drop constraint if exists kk_original_posts_tags_check;
alter table kk_original_posts add constraint kk_original_posts_tags_check check (cardinality(tags) <= 5);
commit;
