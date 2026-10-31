-- Query paths added for navigation and admin filters. Existing FK indexes in
-- 0001/0013/0014 already cover owner, site, scan, notification, and search joins.
create index if not exists profiles_role_created_idx on public.profiles(role, created_at desc);
create index if not exists profiles_suspended_created_idx on public.profiles(suspended, created_at desc);
create index if not exists sites_status_created_idx on public.sites(status, created_at desc);
create index if not exists scans_all_status_created_idx on public.scans(status, created_at desc);
create index if not exists findings_severity_created_idx on public.findings(severity, created_at desc);
create index if not exists scan_jobs_status_created_idx on public.scan_jobs(status, created_at desc);
create index if not exists subscriptions_status_created_idx on public.subscriptions(status, created_at desc);
create index if not exists admin_audit_action_created_idx on public.admin_audit_log(action, created_at desc);
create index if not exists billing_events_type_created_idx on public.billing_events(event_type, created_at desc);

-- One bounded request replaces a query per site on the dashboard overview.
create or replace function public.latest_completed_scan_ids(p_site_ids uuid[], p_cutoff timestamptz)
returns table (id uuid, site_id uuid, created_at timestamptz)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null or p_site_ids is null or pg_catalog.array_length(p_site_ids, 1) > 100
    or p_cutoff is null then raise exception 'invalid scan lookup' using errcode = '22023'; end if;
  return query select distinct on (s.site_id) s.id, s.site_id, s.created_at from public.scans s
    where s.site_id = any(p_site_ids) and s.status = 'completed' and s.created_at >= p_cutoff
    order by s.site_id, s.created_at desc, s.id desc;
end;
$$;
revoke all on function public.latest_completed_scan_ids(uuid[],timestamptz) from public, anon;
grant execute on function public.latest_completed_scan_ids(uuid[],timestamptz) to authenticated, service_role;

-- Keep report permissions server-side while avoiding one network request per site.
create or replace function public.can_edit_sites(p_site_ids uuid[])
returns table (site_id uuid, can_edit boolean)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null or p_site_ids is null or pg_catalog.array_length(p_site_ids, 1) > 100
    then raise exception 'invalid site lookup' using errcode = '22023'; end if;
  return query select s.id, public.can_edit_site(s.id) from public.sites s
    where s.id = any(p_site_ids);
end;
$$;
revoke all on function public.can_edit_sites(uuid[]) from public, anon;
grant execute on function public.can_edit_sites(uuid[]) to authenticated, service_role;

-- The original rate_limit_check remains in place for older deployments.
create or replace function public.rate_limit_status(p_key text, p_limit integer, p_window interval)
returns table (allowed boolean, remaining integer, reset_seconds integer)
language plpgsql volatile security definer set search_path = '' as $$
declare v_hash bytea; v_count integer; v_oldest timestamptz;
begin
  if auth.role() <> 'service_role' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_key is null or length(p_key) > 512 or length(p_key) = 0 or p_limit is null or p_limit not between 1 and 10000
    or p_window is null or p_window <= interval '0 seconds' or p_window > interval '24 hours' then
    raise exception 'invalid rate limit parameters' using errcode = '22023';
  end if;
  v_hash := extensions.digest(p_key, 'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key, 0));
  select count(*)::integer, min(occurred_at) into v_count, v_oldest from public.rate_limits
    where key_hash = v_hash and occurred_at > now() - p_window;
  allowed := v_count < p_limit;
  if allowed then
    insert into public.rate_limits(key_hash) values (v_hash);
    v_count := v_count + 1;
    v_oldest := coalesce(v_oldest, now());
  end if;
  remaining := greatest(0, p_limit - v_count);
  reset_seconds := greatest(1, pg_catalog.ceil(extract(epoch from v_oldest + p_window - now()))::integer);
  return next;
end;
$$;
revoke all on function public.rate_limit_status(text,integer,interval) from public, anon, authenticated;
grant execute on function public.rate_limit_status(text,integer,interval) to service_role;
