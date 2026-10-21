alter table public.billing_events add column processing_started_at timestamptz;
create index billing_events_claim_idx on public.billing_events(processing_started_at) where processed_at is null;
create unique index notifications_payment_event_idx on public.notifications ((data->>'billingEventId'))
  where type = 'payment_failed' and data ? 'billingEventId';

create or replace function public.effective_plan(p_user uuid) returns public.plan_id
language sql stable security definer set search_path = '' as $$
  select case
    when p.suspended then null
    when p.plan_override is not null then p.plan_override
    when sub.status in ('active', 'trialing') then sub.plan_id
    when now() < p.trial_ends_at then 'pro'::public.plan_id
    else null
  end
  from public.profiles p
  left join public.subscriptions sub on sub.owner_id = p.id
  where p.id = p_user;
$$;

create or replace function public.is_team_member(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.team_members tm
    join public.profiles p on p.id = tm.user_id
    join public.teams t on t.id = tm.team_id
    where tm.team_id = p_team and tm.user_id = (select auth.uid()) and not p.suspended
      and public.effective_plan(t.owner_id) = 'agency'
  ), false);
$$;

create or replace function public.current_entitlements(p_user uuid)
returns table (effective_plan public.plan_id, is_trial boolean, read_only boolean,
  site_limit integer, manual_scans_per_month integer, history_days integer,
  team_member_limit integer, scan_interval_hours integer, features jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare v_plan public.plan_id;
begin
  if p_user is null or (auth.role() <> 'service_role' and p_user is distinct from auth.uid() and not public.is_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_plan := public.effective_plan(p_user);
  return query
    select v_plan,
      (p.plan_override is null and coalesce(sub.status not in ('active', 'trialing'), true) and now() < p.trial_ends_at and not p.suspended),
      (v_plan is null), e.site_limit, e.manual_scans_per_month, e.history_days,
      e.team_member_limit, e.scan_interval_hours, e.features
    from public.profiles p
    left join public.subscriptions sub on sub.owner_id = p.id
    left join public.plan_entitlements e on e.id = v_plan
    where p.id = p_user;
end;
$$;

create or replace function public.sync_site_limit(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_limit integer; v_active integer; v_changed integer := 0; v_restored integer;
begin
  if p_user is null then raise exception 'owner required' using errcode = '22023'; end if;
  perform 1 from public.profiles where id = p_user for update;
  select coalesce(e.site_limit, 0) into v_limit
    from public.profiles p left join public.plan_entitlements e on e.id = public.effective_plan(p.id)
    where p.id = p_user;
  with ranked as (
    select id, row_number() over (order by verified_at desc nulls last, created_at, id) as rn
    from public.sites where owner_id = p_user and status = 'active'
  ) update public.sites s set status = 'paused', paused_reason = 'plan_limit', next_scan_at = null
    from ranked r where s.id = r.id and r.rn > coalesce(v_limit, 0);
  get diagnostics v_changed = row_count;
  select count(*) into v_active from public.sites where owner_id = p_user and status = 'active';
  with restore as (
    select id from public.sites where owner_id = p_user and status = 'paused' and paused_reason = 'plan_limit'
    order by verified_at desc nulls last, created_at, id limit greatest(0, coalesce(v_limit, 0) - v_active)
  ) update public.sites s set status = 'active', paused_reason = null, next_scan_at = now()
    from restore r where s.id = r.id;
  get diagnostics v_restored = row_count;
  return v_changed + v_restored;
end;
$$;

create or replace function public.sync_plan_access(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_plan public.plan_id; v_team uuid;
begin
  if p_user is null then raise exception 'owner required' using errcode = '22023'; end if;
  v_plan := public.effective_plan(p_user);
  if v_plan is null or v_plan = 'starter' then
    update public.api_keys set revoked_at = now() where owner_id = p_user and revoked_at is null;
    update public.notification_channels set enabled = false where owner_id = p_user and enabled;
  elsif v_plan = 'pro' then
    update public.api_keys set revoked_at = now() where owner_id = p_user and revoked_at is null
      and not (scopes <@ array['sites:read','scans:read','scans:write','reports:read']::text[]);
  end if;
  if v_plan is distinct from 'agency'::public.plan_id then
    select id into v_team from public.teams where owner_id = p_user;
    if v_team is not null then
      update public.team_invites set revoked_at = now()
      where team_id = v_team and accepted_at is null and revoked_at is null;
    end if;
  end if;
end;
$$;
