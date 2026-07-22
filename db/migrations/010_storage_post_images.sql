-- ============================================================================
--  kkandfriends.com — Storage bucket for member post images. Phase 4.
--  Run ONCE in the Supabase SQL editor, after 002_members.sql.
--
--  Creates a public 'post-images' bucket (5 MB / image types only) and Storage
--  policies: approved members upload; anyone can read (images render inside
--  posts); members can delete their own uploads. Image URLs are public but
--  unguessable and only surface inside members-only posts.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 5242880,
        array['image/png','image/jpeg','image/gif','image/webp'])
on conflict (id) do update set
  public            = excluded.public,
  file_size_limit   = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Approved members may upload into the bucket.
drop policy if exists "post_images_insert" on storage.objects;
create policy "post_images_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-images' and public.is_member());

-- Public read (also served directly via the public bucket URL).
drop policy if exists "post_images_read" on storage.objects;
create policy "post_images_read" on storage.objects
  for select to public
  using (bucket_id = 'post-images');

-- Members can remove their own uploads.
drop policy if exists "post_images_delete_own" on storage.objects;
create policy "post_images_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-images' and owner = auth.uid());
