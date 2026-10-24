-- Starting and queueing a scan is atomic. The site lock serializes competing
-- requests; the existing partial unique index remains a final race guard.
create function public.start_scan(
  p_site uuid,
  p_kind public.scan_kind,
  p_requester uuid,
  p_idempotency text default null,
  p_priority integer default 0
) returns public.scans
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_site public.sites%rowtype;
  v_existing public.scans%rowtype;
  v_scan public.scans%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_site is null or p_kind is null or p_priority is null or p_priority not between -100 and 100 then
    raise exception 'invalid scan request' using errcode = '22023';
  end if;

  select * into v_site from public.sites where id = p_site for update;
  if not found then raise exception 'site not found' using errcode = 'P0002'; end if;

  if p_idempotency is not null then
    select * into v_existing from public.scans where idempotency_key = p_idempotency;
    if found then
      if v_existing.site_id = p_site and v_existing.kind = p_kind
        and v_existing.requested_by is not distinct from p_requester then
        return v_existing;
      end if;
      raise exception 'idempotency key conflict' using errcode = 'SG002';
    end if;
  end if;

  -- Lock jobs before changing scans, matching the worker's job-then-scan order.
  perform 1 from public.scan_jobs j
    join public.scans sc on sc.id = j.scan_id
    where sc.site_id = p_site and sc.status in ('queued', 'running')
      and j.status in ('queued', 'running')
    for update of j;

  if exists (
    select 1 from public.scan_jobs j join public.scans sc on sc.id = j.scan_id
    where sc.site_id = p_site and sc.status in ('queued', 'running')
      and ((j.status = 'running' and j.lease_expires_at > now())
        or (j.status = 'queued' and j.available_at <= now() + interval '15 minutes'
          and j.created_at > now() - interval '15 minutes'))
  ) then
    raise exception 'scan already in progress' using errcode = 'SG001';
  end if;

  update public.scan_jobs j set status = 'canceled', completed_at = now(),
    locked_at = null, locked_by = null, lease_expires_at = null,
    last_error_code = 'superseded_stale_job'
  from public.scans sc
  where sc.id = j.scan_id and sc.site_id = p_site
    and sc.status in ('queued', 'running') and j.status in ('queued', 'running');

  update public.scans set status = 'failed', started_at = coalesce(started_at, now()),
    completed_at = now(), failure_code = 'superseded_stale_job'
  where site_id = p_site and status in ('queued', 'running');

  insert into public.scans(site_id, kind, requested_by, idempotency_key)
    values (p_site, p_kind, p_requester, p_idempotency)
    returning * into v_scan;
  insert into public.scan_jobs(scan_id, module_key, step_key, priority)
    values (v_scan.id, 'orchestrator', 'bootstrap', p_priority);
  return v_scan;
end;
$$;

revoke all on function public.start_scan(uuid, public.scan_kind, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.start_scan(uuid, public.scan_kind, uuid, text, integer) to service_role;

-- Scheduled scans use the same active-job test and stale-job recovery.
create or replace function public.enqueue_due_scans(p_limit integer default 100) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  r record;
  v_count integer := 0;
  v_interval integer;
  v_plan public.plan_id;
  v_scan public.scans%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 500 then raise exception 'invalid enqueue limit' using errcode = '22023'; end if;

  for r in select p.id from public.profiles p where p.trial_ends_at <= now()
    and p.plan_override is null and not p.suspended
    and not exists (select 1 from public.subscriptions sub where sub.owner_id = p.id and sub.status = 'active')
    and exists (select 1 from public.sites s where s.owner_id = p.id and s.status = 'active')
    limit p_limit loop
    perform public.sync_site_limit(r.id);
    perform public.sync_plan_access(r.id);
  end loop;

  for r in select s.* from public.sites s where s.status = 'active' and s.next_scan_at <= now()
    order by s.next_scan_at limit p_limit for update skip locked loop
    v_plan := public.effective_plan(r.owner_id);
    if v_plan is null then continue; end if;
    select scan_interval_hours into v_interval from public.plan_entitlements where id = v_plan;
    begin
      v_scan := public.start_scan(r.id,
        case when r.verified_at is null or r.verification_due_at is null or r.verification_due_at <= now()
          then 'passive'::public.scan_kind else 'automatic'::public.scan_kind end,
        null, null, 0);
    exception when sqlstate 'SG001' then
      continue;
    end;
    update public.sites set next_scan_at = now() + make_interval(hours => v_interval) where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
