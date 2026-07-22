-- ============================================================================
--  kkandfriends.com — Harden public_member_profiles. Phase 3 (security).
--  Run ONCE in the Supabase SQL editor, after 004_member_posts.sql.
--
--  public_member_profiles is a SECURITY DEFINER view BY DESIGN: it exposes only
--  a safe, non-sensitive subset of approved members (display_name, identity_mode,
--  field, avatar_url, is_founding, opted-in affiliation) and NEVER the private
--  columns (real_name, contact_email, note_to_admin). The base `profiles` table
--  stays self+admin-only (002); a definer view is the correct way to publish a
--  narrow, safe projection of it. (Supabase's advisor flags all definer views
--  for review — this one is intentional and reviewed.)
--
--  This migration tightens it further: gate the rows with is_member() so only
--  APPROVED members (and the admin) can read the directory — a signed-in but
--  not-yet-approved user now sees nothing. Column list is unchanged.
-- ============================================================================
create or replace view public.public_member_profiles as
  select
    id,
    display_name,
    identity_mode,
    field,
    avatar_url,
    is_founding,
    case when show_affiliation then affiliation else null end as affiliation
  from public.profiles
  where status = 'approved'
    and (public.is_member() or public.is_admin());

grant select on public.public_member_profiles to authenticated;
