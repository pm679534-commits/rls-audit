-- Phase 8: compact operational aggregates and atomic queue controls.
create index if not exists profiles_created_idx on public.profiles(created_at desc);
create index if not exists subscriptions_created_idx on public.subscriptions(created_at desc);
create index if not exists scans_created_status_idx on public.scans(created_at desc, status);
create index if not exists billing_events_created_idx on public.billing_events(created_at desc);
create index if not exists sites_created_idx on public.sites(created_at desc);

create function public.maintenance_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select value = 'true'::jsonb from public.app_settings where key = 'maintenance_mode'), false);
$$;
revoke all on function public.maintenance_enabled() from public;
grant execute on function public.maintenance_enabled() to anon, authenticated, service_role;

create function public.admin_dashboard_metrics(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_since timestamptz; v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_days not between 7 and 90 then raise exception 'invalid period' using errcode = '22023'; end if;
  v_since := (current_date - (p_days - 1))::timestamptz;
  select jsonb_build_object(
    'signups', (select count(*) from public.profiles where created_at >= v_since),
    'trialsStarted', (select count(*) from public.profiles where trial_started_at >= v_since),
    'trialsConverted', (select count(*) from public.subscriptions s join public.profiles p on p.id = s.owner_id where s.created_at >= v_since and p.trial_started_at < s.created_at),
    'churned', (select count(*) from public.subscriptions where canceled_at >= v_since),
    'queueDepth', (select count(*) from public.scan_jobs where status = 'queued'),
    'runningJobs', (select count(*) from public.scan_jobs where status = 'running'),
    'failedScans', (select count(*) from public.scans where status = 'failed' and created_at >= v_since),
    'finishedScans', (select count(*) from public.scans where status in ('failed','completed') and created_at >= v_since),
    'subscriptionMix', coalesce((select jsonb_agg(jsonb_build_object('plan', plan_id, 'period', billing_period, 'count', total)) from
      (select plan_id, billing_period, count(*) total from public.subscriptions where status = 'active' group by plan_id, billing_period) x), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d.day,
      'signups', (select count(*) from public.profiles p where p.created_at >= d.day and p.created_at < d.day + interval '1 day'),
      'scans', (select count(*) from public.scans s where s.created_at >= d.day and s.created_at < d.day + interval '1 day'),
      'failed', (select count(*) from public.scans s where s.status = 'failed' and s.created_at >= d.day and s.created_at < d.day + interval '1 day')) order by d.day)
      from generate_series(v_since::date, current_date, interval '1 day') as d(day)), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_dashboard_metrics(integer) from public, anon, authenticated;
grant execute on function public.admin_dashboard_metrics(integer) to service_role;

create function public.admin_requeue_scan(p_scan uuid) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_status public.scan_status; v_count integer; v_site_status public.site_status; v_owner uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode = '42501'; end if;
  select sc.status, s.status, s.owner_id into v_status, v_site_status, v_owner
    from public.scans sc join public.sites s on s.id = sc.site_id where sc.id = p_scan for update of sc;
  if v_status is null then raise exception 'scan not found' using errcode = 'P0002'; end if;
  if v_status <> 'failed' then raise exception 'only failed scans can be requeued' using errcode = '22023'; end if;
  if v_site_status <> 'active' or public.effective_plan(v_owner) is null then
    raise exception 'site is not eligible for scanning' using errcode = '22023';
  end if;
  update public.scans set status = 'queued', completed_at = null, failure_code = null where id = p_scan;
  update public.scan_jobs set status = 'queued', attempts = 0, available_at = now(),
    locked_at = null, locked_by = null, lease_expires_at = null, completed_at = null, last_error_code = null
    where scan_id = p_scan and status in ('failed','dead','canceled');
  get diagnostics v_count = row_count;
  if v_count = 0 then
    insert into public.scan_jobs(scan_id, module_key, step_key) values (p_scan, 'orchestrator', 'bootstrap')
      on conflict (scan_id, module_key, step_key) do update set status = 'queued', attempts = 0,
        available_at = now(), completed_at = null, last_error_code = null;
    v_count := 1;
  end if;
  return v_count;
end;
$$;
revoke all on function public.admin_requeue_scan(uuid) from public, anon, authenticated;
grant execute on function public.admin_requeue_scan(uuid) to service_role;

create function public.admin_cancel_scan(p_scan uuid) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode = '42501'; end if;
  update public.scans set status = 'canceled', completed_at = now(), started_at = coalesce(started_at, now())
    where id = p_scan and status in ('queued','running');
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'scan is not active' using errcode = '22023'; end if;
  update public.scan_jobs set status = 'canceled', completed_at = now(), locked_at = null,
    locked_by = null, lease_expires_at = null where scan_id = p_scan and status in ('queued','running');
  return v_count;
end;
$$;
revoke all on function public.admin_cancel_scan(uuid) from public, anon, authenticated;
grant execute on function public.admin_cancel_scan(uuid) to service_role;

create or replace function public.claim_scan_jobs(p_limit integer, p_worker text, p_lease_seconds integer default 180)
returns setof public.scan_jobs
language plpgsql volatile security definer set search_path = '' as $$
declare v_global integer; v_owner integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 50 or length(coalesce(p_worker, '')) not between 1 and 120
    or p_lease_seconds is null or p_lease_seconds not between 30 and 900 then
    raise exception 'invalid claim parameters' using errcode = '22023';
  end if;
  select least(50, greatest(1, coalesce((select (value #>> '{}')::integer from public.app_settings where key = 'global_scan_concurrency'), 50))) into v_global;
  select least(10, greatest(1, coalesce((select (value #>> '{}')::integer from public.app_settings where key = 'per_user_scan_concurrency'), 2))) into v_owner;
  perform pg_catalog.pg_advisory_xact_lock(74163723);
  return query
    with capacity as (
      select greatest(0, v_global - count(*)::integer) as free_slots from public.scan_jobs where status = 'running'
    ), locked_candidates as (
      select j.id, s.owner_id, j.priority, j.available_at, j.created_at
      from public.scan_jobs j
      join public.scans sc on sc.id = j.scan_id
      join public.sites s on s.id = sc.site_id
      where j.status = 'queued' and j.available_at <= now() and sc.status in ('queued', 'running')
        and s.status = 'active' and public.effective_plan(s.owner_id) is not null
        and (select count(*) from public.scan_jobs running
             join public.scans rs on rs.id = running.scan_id
             join public.sites owner_site on owner_site.id = rs.site_id
             where running.status = 'running' and owner_site.owner_id = s.owner_id) < v_owner
      order by j.priority desc, j.available_at, j.created_at
      limit p_limit * 50
      for update of j skip locked
    ), candidates as (
      select lc.id, lc.owner_id,
        row_number() over (partition by lc.owner_id order by lc.priority desc, lc.available_at, lc.created_at) as owner_rank
      from locked_candidates lc
    ), picked as (
      select c.id from candidates c, capacity cap
      where c.owner_rank <= v_owner - (
        select count(*) from public.scan_jobs running
        join public.scans rs on rs.id = running.scan_id
        join public.sites owner_site on owner_site.id = rs.site_id
        where running.status = 'running' and owner_site.owner_id = c.owner_id
      )
      limit least(p_limit, (select free_slots from capacity))
    ), claimed as (
      update public.scan_jobs j
      set status = 'running', attempts = j.attempts + 1, locked_at = now(), locked_by = p_worker,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds)
      where j.id in (select id from picked)
      returning j.*
    ), started as (
      update public.scans sc set status = 'running', started_at = coalesce(sc.started_at, now())
      where sc.id in (select scan_id from claimed) and sc.status = 'queued'
      returning sc.id
    )
    select claimed.* from claimed;
end;
$$;

create or replace function public.enqueue_due_scans(p_limit integer default 100) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare r record; v_scan uuid; v_count integer := 0; v_interval integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 500 then raise exception 'invalid enqueue limit' using errcode = '22023'; end if;
  for r in select p.id from public.profiles p where p.trial_ends_at <= now()
    and p.plan_override is null and not p.suspended
    and not exists (select 1 from public.subscriptions sub where sub.owner_id = p.id and sub.status = 'active')
    and exists (select 1 from public.sites s where s.owner_id = p.id and s.status = 'active')
    limit p_limit loop
    perform public.sync_site_limit(r.id);
    perform public.sync_plan_access(r.id);
  end loop;
  if not coalesce((select enabled from public.feature_flags where key = 'automatic_scans'), false) then return 0; end if;
  for r in
    select s.* from public.sites s where s.status = 'active' and s.next_scan_at <= now()
    order by s.next_scan_at limit p_limit for update skip locked
  loop
    if public.effective_plan(r.owner_id) is null or exists (
      select 1 from public.scans sc where sc.site_id = r.id and sc.status in ('queued', 'running')
    ) then continue; end if;
    select scan_interval_hours into v_interval from public.plan_entitlements where id = public.effective_plan(r.owner_id);
    insert into public.scans(site_id, kind, status)
      values (r.id, case when r.verified_at is null or r.verification_due_at is null or r.verification_due_at <= now() then 'passive'::public.scan_kind else 'automatic'::public.scan_kind end, 'queued')
      returning id into v_scan;
    insert into public.scan_jobs(scan_id, module_key, step_key) values (v_scan, 'orchestrator', 'bootstrap');
    update public.sites set next_scan_at = now() + make_interval(hours => v_interval) where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
