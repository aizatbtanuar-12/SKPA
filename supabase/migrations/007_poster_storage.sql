-- =====================================================================
-- Migration 007: storage for donation-drive posters
-- Posters are meant to be shared (WhatsApp, Facebook), so the bucket is public:
-- anyone with the link can view a poster. Only AJK PIBG (admin/pibg) can upload.
-- Donation receipts reuse the private 'bukti-bayaran' bucket from 002.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('poster-kempen', 'poster-kempen', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "poster: staff upload" on storage.objects;
create policy "poster: staff upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'poster-kempen' and public.is_staff());

drop policy if exists "poster: staff delete" on storage.objects;
create policy "poster: staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'poster-kempen' and public.is_staff());

drop policy if exists "poster: read" on storage.objects;
create policy "poster: read" on storage.objects for select
  using (bucket_id = 'poster-kempen');
