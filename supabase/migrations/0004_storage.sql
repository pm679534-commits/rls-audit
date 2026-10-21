-- Storage object paths begin with the owning profile UUID.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values
  ('report-pdfs', 'report-pdfs', false, 20971520, array['application/pdf']),
  ('data-exports', 'data-exports', false, 52428800, array['application/json','text/csv']),
  ('white-label-logos', 'white-label-logos', false, 5242880, array['image/png','image/jpeg','image/webp']),
  ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy siteguard_reports_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'report-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy siteguard_exports_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'data-exports' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy siteguard_logos_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'white-label-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy siteguard_logos_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'white-label-logos' and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.current_entitlements((select auth.uid())) e where e.effective_plan = 'agency'));
create policy siteguard_logos_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'white-label-logos' and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.current_entitlements((select auth.uid())) e where e.effective_plan = 'agency'))
  with check (bucket_id = 'white-label-logos' and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.current_entitlements((select auth.uid())) e where e.effective_plan = 'agency'));
create policy siteguard_logos_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'white-label-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy siteguard_avatars_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy siteguard_avatars_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy siteguard_avatars_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy siteguard_avatars_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
