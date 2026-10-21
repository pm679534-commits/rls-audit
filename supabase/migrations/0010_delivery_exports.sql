-- Phase 9: durable outbound delivery and export workers. Clients cannot write either queue.
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel_id uuid references public.notification_channels(id) on delete cascade,
  destination text not null check (destination in ('email','slack','discord','webhook')),
  status public.job_status not null default 'queued',
  attempts integer not null default 0 check (attempts between 0 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error_code text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((destination = 'email' and channel_id is null) or (destination <> 'email' and channel_id is not null))
);
create unique index notification_deliveries_email_unique on public.notification_deliveries(notification_id) where destination = 'email';
create unique index notification_deliveries_channel_unique on public.notification_deliveries(notification_id, channel_id) where channel_id is not null;
create index notification_deliveries_notification_idx on public.notification_deliveries(notification_id);
create index notification_deliveries_claim_idx on public.notification_deliveries(available_at, created_at) where status = 'queued';
create index notification_deliveries_lock_idx on public.notification_deliveries(locked_at) where status = 'running';
create index notification_deliveries_channel_idx on public.notification_deliveries(channel_id) where channel_id is not null;
create trigger notification_deliveries_updated_at before update on public.notification_deliveries for each row execute function public.set_updated_at();
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from public, anon, authenticated;
grant all on public.notification_deliveries to service_role;

-- Stable event keys make cron retries and webhook replay harmless.
create unique index notifications_event_key_idx on public.notifications(user_id, (data->>'eventKey')) where data ? 'eventKey';

create function public.queue_notification_delivery() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notification_deliveries(notification_id, destination)
    values (new.id, 'email') on conflict do nothing;
  if new.type in ('finding_alert','score_regression','verification_failed') then
    insert into public.notification_deliveries(notification_id, channel_id, destination)
      select new.id, c.id, c.type::text from public.notification_channels c
      where c.owner_id = new.user_id and c.enabled and (c.site_id is null or c.site_id = new.site_id)
      on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger queue_notification_delivery after insert on public.notifications
for each row execute function public.queue_notification_delivery();

-- The completed scan is the commit point. Alerts are inserted in the same transaction.
create function public.notify_completed_scan() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_previous uuid; v_prior_score integer; v_finding record;
begin
  if new.status <> 'completed' or (tg_op = 'UPDATE' and old.status = 'completed') then return new; end if;
  select owner_id into v_owner from public.sites where id = new.site_id;
  select id, score into v_previous, v_prior_score from public.scans
    where site_id = new.site_id and id <> new.id and status = 'completed'
    order by completed_at desc limit 1;
  insert into public.notifications(user_id, site_id, type, title_key, body_key, data)
    values (v_owner, new.site_id, 'scan_completed', 'Notifications.scanCompletedTitle', 'Notifications.scanCompletedBody',
      jsonb_build_object('eventKey', 'scan:' || new.id, 'scanId', new.id, 'score', new.score)) on conflict do nothing;
  if v_prior_score is not null and new.score <= v_prior_score - 10 then
    insert into public.notifications(user_id, site_id, type, title_key, body_key, data)
      values (v_owner, new.site_id, 'score_regression', 'Notifications.scoreRegressionTitle', 'Notifications.scoreRegressionBody',
        jsonb_build_object('eventKey', 'regression:' || new.id, 'scanId', new.id, 'score', new.score, 'previousScore', v_prior_score)) on conflict do nothing;
  end if;
  for v_finding in select f.id, f.finding_key, f.severity from public.findings f
    where f.scan_id = new.id and f.severity in ('critical','high')
      and not exists (select 1 from public.findings prior where prior.scan_id = v_previous and prior.fingerprint = f.fingerprint)
  loop
    insert into public.notifications(user_id, site_id, type, title_key, body_key, data)
      values (v_owner, new.site_id, 'finding_alert', 'Notifications.findingAlertTitle', 'Notifications.findingAlertBody',
        jsonb_build_object('eventKey', 'finding:' || v_finding.id, 'scanId', new.id, 'findingId', v_finding.id,
          'findingKey', v_finding.finding_key, 'severity', v_finding.severity)) on conflict do nothing;
  end loop;
  return new;
end;
$$;
create trigger notify_completed_scan after update of status on public.scans
for each row when (new.status = 'completed') execute function public.notify_completed_scan();

create function public.notify_subscription_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.plan_id is not distinct from old.plan_id and new.status is not distinct from old.status
      and new.cancel_at_period_end is not distinct from old.cancel_at_period_end then return new; end if;
  end if;
  insert into public.notifications(user_id, type, title_key, body_key, data)
    values (new.owner_id, 'subscription_changed', 'Notifications.subscriptionChangedTitle', 'Notifications.subscriptionChangedBody',
      jsonb_build_object('eventKey', 'subscription:' || new.id || ':' || new.updated_at, 'plan', new.plan_id, 'status', new.status)) on conflict do nothing;
  return new;
end;
$$;
create trigger notify_subscription_change after insert or update on public.subscriptions
for each row execute function public.notify_subscription_change();

alter table public.data_exports add column attempts integer not null default 0 check (attempts between 0 and 10);
alter table public.data_exports add column available_at timestamptz not null default now();
alter table public.data_exports add column locked_at timestamptz;
create index data_exports_claim_idx on public.data_exports(available_at, created_at) where status = 'queued';
create index data_exports_stuck_idx on public.data_exports(locked_at) where status = 'processing';

create function public.claim_notification_deliveries(p_limit integer default 20)
returns setof public.notification_deliveries language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid limit' using errcode = '22023'; end if;
  with stale as (select id from public.notification_deliveries where status = 'running'
    and locked_at < now() - interval '5 minutes' and attempts < 5
    order by locked_at limit 100 for update skip locked)
  update public.notification_deliveries set status = 'queued', locked_at = null,
    available_at = now(), last_error_code = 'lease_expired'
    where id in (select id from stale);
  with exhausted as (select id from public.notification_deliveries where status = 'running'
    and locked_at < now() - interval '5 minutes' and attempts >= 5
    order by locked_at limit 100 for update skip locked)
  update public.notification_deliveries set status = 'dead', locked_at = null, last_error_code = 'retries_exhausted'
    where id in (select id from exhausted);
  return query with picked as (
    select id from public.notification_deliveries where status = 'queued' and available_at <= now()
    order by available_at, created_at limit p_limit for update skip locked
  ) update public.notification_deliveries d set status = 'running', locked_at = now(), attempts = d.attempts + 1
    where d.id in (select id from picked) returning d.*;
end;
$$;

create function public.claim_data_exports(p_limit integer default 2)
returns setof public.data_exports language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 10 then raise exception 'invalid limit' using errcode = '22023'; end if;
  with stale as (select id from public.data_exports where status = 'processing'
    and locked_at < now() - interval '10 minutes' and attempts < 5
    order by locked_at limit 20 for update skip locked)
  update public.data_exports set status = 'queued', locked_at = null, available_at = now(), error_code = 'lease_expired'
    where id in (select id from stale);
  with exhausted as (select id from public.data_exports where status = 'processing'
    and locked_at < now() - interval '10 minutes' and attempts >= 5
    order by locked_at limit 20 for update skip locked)
  update public.data_exports set status = 'failed', locked_at = null, error_code = 'retries_exhausted'
    where id in (select id from exhausted);
  return query with picked as (
    select id from public.data_exports where status = 'queued' and available_at <= now()
    order by available_at, created_at limit p_limit for update skip locked
  ) update public.data_exports e set status = 'processing', locked_at = now(), attempts = e.attempts + 1
    where e.id in (select id from picked) returning e.*;
end;
$$;

-- The Phase 8 scheduler override omitted site-specific intervals; retain the plan minimum.
create or replace function public.enqueue_due_scans(p_limit integer default 100) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare r record; v_scan uuid; v_count integer := 0; v_interval integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 500 then raise exception 'invalid enqueue limit' using errcode = '22023'; end if;
  for r in select p.id from public.profiles p where p.trial_ends_at <= now()
    and p.plan_override is null and not p.suspended
    and not exists (select 1 from public.subscriptions sub where sub.owner_id = p.id and sub.status in ('active','trialing'))
    and exists (select 1 from public.sites s where s.owner_id = p.id and s.status = 'active')
    limit p_limit loop
    perform public.sync_site_limit(r.id);
    perform public.sync_plan_access(r.id);
  end loop;
  if not coalesce((select enabled from public.feature_flags where key = 'automatic_scans'), false) then return 0; end if;
  for r in select s.* from public.sites s where s.status = 'active' and s.next_scan_at <= now()
    order by s.next_scan_at limit p_limit for update skip locked
  loop
    if public.effective_plan(r.owner_id) is null or exists (
      select 1 from public.scans sc where sc.site_id = r.id and sc.status in ('queued','running')
    ) then continue; end if;
    select greatest(coalesce(r.scan_interval_hours, e.scan_interval_hours), e.scan_interval_hours)
      into v_interval from public.plan_entitlements e where e.id = public.effective_plan(r.owner_id);
    insert into public.scans(site_id, kind, status)
      values (r.id, case when r.verified_at is null or r.verification_due_at is null or r.verification_due_at <= now()
        then 'passive'::public.scan_kind else 'automatic'::public.scan_kind end, 'queued') returning id into v_scan;
    insert into public.scan_jobs(scan_id, module_key, step_key) values (v_scan, 'orchestrator', 'bootstrap');
    update public.sites set next_scan_at = now() + make_interval(hours => v_interval) where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create function public.enqueue_trial_notifications(p_limit integer default 500) returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; v_expired boolean; v_type public.notification_type; v_count integer := 0;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 1000 then raise exception 'invalid limit' using errcode = '22023'; end if;
  for r in select p.id, p.trial_ends_at from public.profiles p
    where not p.suspended and p.plan_override is null
      and p.trial_ends_at >= now() - interval '7 days' and p.trial_ends_at <= now() + interval '1 day'
      and not exists (select 1 from public.subscriptions s where s.owner_id = p.id and s.status in ('active','trialing'))
      and not exists (select 1 from public.notifications n where n.user_id = p.id
        and n.data->>'eventKey' = 'trial:' || case when p.trial_ends_at <= now() then 'trial_expired' else 'trial_reminder' end || ':' || p.id)
    order by p.trial_ends_at limit p_limit for update of p skip locked
  loop
    v_expired := r.trial_ends_at <= now();
    v_type := case when v_expired then 'trial_expired'::public.notification_type else 'trial_reminder'::public.notification_type end;
    insert into public.notifications(user_id, type, title_key, body_key, data)
      values (r.id, v_type, case when v_expired then 'Notifications.trialExpiredTitle' else 'Notifications.trialReminderTitle' end,
        case when v_expired then 'Notifications.trialExpiredBody' else 'Notifications.trialReminderBody' end,
        jsonb_build_object('eventKey', 'trial:' || v_type || ':' || r.id, 'days', case when v_expired then 0 else 1 end))
      on conflict do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Keep source scans until their seven-day export download window closes, so
-- storage cleanup can run before cascading deletes remove export metadata.
create or replace function public.purge_expired_scan_history(p_limit integer default 500) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 5000 then raise exception 'invalid purge limit' using errcode = '22023'; end if;
  with old_scans as (
    select sc.id from public.scans sc
    join public.sites s on s.id = sc.site_id
    left join public.plan_entitlements e on e.id = public.effective_plan(s.owner_id)
    where sc.created_at < now() - make_interval(days => coalesce(e.history_days, 30))
      and sc.status in ('completed','failed','canceled')
      and not exists (select 1 from public.data_exports x where x.scan_id = sc.id and x.storage_path is not null and x.status = 'completed')
    order by sc.created_at limit p_limit for update of sc skip locked
  ), removed as (
    delete from public.scans where id in (select id from old_scans) returning id
  ) select count(*) into v_count from removed;
  delete from public.rate_limits where occurred_at < now() - interval '24 hours';
  return v_count;
end;
$$;

revoke all on function public.queue_notification_delivery() from public, anon, authenticated;
revoke all on function public.notify_completed_scan() from public, anon, authenticated;
revoke all on function public.notify_subscription_change() from public, anon, authenticated;
revoke all on function public.claim_notification_deliveries(integer) from public, anon, authenticated;
revoke all on function public.claim_data_exports(integer) from public, anon, authenticated;
revoke all on function public.enqueue_trial_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_deliveries(integer) to service_role;
grant execute on function public.claim_data_exports(integer) to service_role;
grant execute on function public.enqueue_trial_notifications(integer) to service_role;
