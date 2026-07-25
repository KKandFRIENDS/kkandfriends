-- ============================================================================
--  kkandfriends.com — Let members change their own profile photo.
--  Run ONCE in the Supabase SQL editor, after 002_members.sql.
--
--  `avatar_url` has existed since 002 but was populated only by the sign-up
--  trigger (the Google / Kakao profile picture) and was NOT in the member
--  UPDATE grant, so nobody could change it. This adds that one column.
--
--  No Storage changes are needed: the /me uploader reuses the `post-images`
--  bucket from migration 010 (approved-members-only INSERT, public read) under
--  an `avatars/` path prefix.
--
--  Everything else stays locked: status, is_founding and approved_at are still
--  outside the grant, so a member still cannot approve or promote themselves.
-- ============================================================================

grant update (avatar_url) on public.profiles to authenticated;
