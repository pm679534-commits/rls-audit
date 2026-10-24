-- Existing foreign-key indexes already cover scans.site_id, findings.scan_id,
-- notifications.user_id/site_id, scan_jobs.scan_id, subscriptions.owner_id,
-- and site_verifications.site_id. These cover the remaining hot sort/filter paths.

create index if not exists sites_owner_name_idx
  on public.sites(owner_id, name);

create index if not exists scans_site_completed_recent_idx
  on public.scans(site_id, created_at desc)
  where status = 'completed';

create index if not exists findings_site_scan_id_idx
  on public.findings(site_id, scan_id, id);

create index if not exists scan_jobs_running_scan_lease_idx
  on public.scan_jobs(scan_id, lease_expires_at)
  where status = 'running';

create index if not exists subscriptions_status_period_end_idx
  on public.subscriptions(status, current_period_end)
  where current_period_end is not null;

create index if not exists site_verifications_site_status_recent_idx
  on public.site_verifications(site_id, status, created_at desc);

create index if not exists site_verifications_pending_recheck_idx
  on public.site_verifications(checked_at, created_at)
  where status = 'pending';

-- The existing notifications_user_unread_idx is already a covering path for
-- the shell's unread count; a second unread index would increase write cost.
