-- Release hardening: prevent suspended or read-only accounts from writing
-- directly to Storage with a valid but no longer eligible auth token.
drop policy if exists siteguard_logos_owner_insert on storage.objects;
create policy siteguard_logos_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'white-label-logos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.current_entitlements((select auth.uid())) e
      where e.effective_plan = 'agency' and not e.read_only));

drop policy if exists siteguard_logos_owner_update on storage.objects;
create policy siteguard_logos_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'white-label-logos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.current_entitlements((select auth.uid())) e
      where e.effective_plan = 'agency' and not e.read_only))
  with check (bucket_id = 'white-label-logos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.current_entitlements((select auth.uid())) e
      where e.effective_plan = 'agency' and not e.read_only));

drop policy if exists siteguard_avatars_owner_insert on storage.objects;
create policy siteguard_avatars_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and not p.suspended));

drop policy if exists siteguard_avatars_owner_update on storage.objects;
create policy siteguard_avatars_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and not p.suspended))
  with check (bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and not p.suspended));

-- Trigger functions are not callable as normal RPCs, but revoke the default
-- PUBLIC execute privilege for the function introduced after migration 0003.
revoke all on function public.enforce_site_scan_settings() from public, anon, authenticated;
