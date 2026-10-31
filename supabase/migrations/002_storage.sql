-- =====================================================================
-- Migration 002: storage bucket for proof of payment (bukti bayaran)
-- Files are private. Parents upload into a folder named after their
-- user id; only the uploader and AJK PIBG (admin/pibg) can open them.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bukti-bayaran', 'bukti-bayaran', false, 5242880,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy "bukti: upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'bukti-bayaran' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "bukti: read own or staff" on storage.objects for select to authenticated
  using (bucket_id = 'bukti-bayaran'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));

create policy "bukti: staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'bukti-bayaran' and public.is_staff());
