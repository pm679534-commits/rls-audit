-- Admin plan controls and a bounded directory query. Apply after 0013.
alter table public.profiles add column if not exists plan_override_expires_at timestamptz;
create or replace function public.protect_profile_privileges() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('postgres','service_role') and (
    new.email is distinct from old.email or new.role is distinct from old.role or
    new.trial_started_at is distinct from old.trial_started_at or new.trial_ends_at is distinct from old.trial_ends_at or
    new.suspended is distinct from old.suspended or new.plan_override is distinct from old.plan_override or
    new.plan_override_expires_at is distinct from old.plan_override_expires_at or
    new.created_at is distinct from old.created_at or new.email_unsubscribed_at is distinct from old.email_unsubscribed_at
  ) then raise exception 'protected profile fields' using errcode = '42501'; end if;
  return new;
end;
$$;
drop trigger if exists on_profile_entitlement_change on public.profiles;
create trigger on_profile_entitlement_change after update of plan_override, plan_override_expires_at, trial_ends_at, suspended
  on public.profiles for each row execute function public.on_profile_entitlement_change();

create extension if not exists pg_trgm with schema extensions;
do $$
declare v_schema text;
begin
  select n.nspname into v_schema from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm';
  execute pg_catalog.format('create index if not exists profiles_email_search_idx on public.profiles using gin ((email::text) %I.gin_trgm_ops)', v_schema);
  execute pg_catalog.format('create index if not exists profiles_display_name_search_idx on public.profiles using gin (display_name %I.gin_trgm_ops)', v_schema);
end;
$$;
create index if not exists sites_owner_status_idx on public.sites (owner_id, status);
create index if not exists admin_audit_user_history_idx on public.admin_audit_log (target_id, created_at desc)
  where target_table = 'profiles';

create or replace function public.effective_plan(p_user uuid) returns public.plan_id
language sql stable security definer set search_path = '' as $$
  select case
    when p.suspended then null
    when p.plan_override is not null and (p.plan_override_expires_at is null or p.plan_override_expires_at > now())
      and (sub.status not in ('active','trialing') or sub.status is null or
        case p.plan_override when 'agency' then 3 when 'pro' then 2 else 1 end >=
        case sub.plan_id when 'agency' then 3 when 'pro' then 2 else 1 end)
      then p.plan_override
    when sub.status in ('active','trialing') then sub.plan_id
    when p.plan_override is not null and (p.plan_override_expires_at is null or p.plan_override_expires_at > now()) then p.plan_override
    when now() < p.trial_ends_at then 'pro'::public.plan_id
    else null
  end
  from public.profiles p left join public.subscriptions sub on sub.owner_id = p.id where p.id = p_user;
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
  return query select v_plan,
    (v_plan = 'pro' and not (p.plan_override is not null and (p.plan_override_expires_at is null or p.plan_override_expires_at > now()))
      and coalesce(sub.status not in ('active','trialing'), true)
      and now() < p.trial_ends_at and not p.suspended),
    (v_plan is null), e.site_limit, e.manual_scans_per_month, e.history_days,
    e.team_member_limit, e.scan_interval_hours, e.features
    from public.profiles p left join public.subscriptions sub on sub.owner_id = p.id
    left join public.plan_entitlements e on e.id = v_plan where p.id = p_user;
end;
$$;

create or replace function public.admin_user_directory(
  p_search text default '', p_plan text default 'all', p_status text default 'all',
  p_role text default 'all', p_sort text default 'created_at', p_desc boolean default true,
  p_offset integer default 0)
returns table (id uuid, email text, display_name text, role text, locale text,
  effective_plan text, plan_source text, trial_ends_at timestamptz, sites_used bigint,
  site_limit integer, created_at timestamptz, last_sign_in_at timestamptz, status text,
  plan_override text, plan_override_expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_order text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode = '42501'; end if;
  if length(p_search) > 120 or p_plan not in ('all','none','starter','pro','agency') or
    p_status not in ('all','trial','active','past_due','canceled','suspended') or
    p_role not in ('all','user','admin') or p_offset not between 0 and 250000 then
    raise exception 'invalid directory filter' using errcode = '22023';
  end if;
  v_order := case p_sort when 'email' then 'email' when 'role' then 'role' when 'effective_plan' then 'effective_plan'
    when 'trial_ends_at' then 'trial_ends_at' when 'sites_used' then 'sites_used'
    when 'last_sign_in_at' then 'last_sign_in_at' when 'status' then 'status'
    else 'created_at' end;
  return query execute format($sql$
    with users as (
      select p.id, p.email::text email, p.display_name, p.role::text role, p.locale,
        public.effective_plan(p.id)::text effective_plan, p.trial_ends_at,
        p.created_at, au.last_sign_in_at, p.plan_override::text plan_override,
        p.plan_override_expires_at, sub.status::text subscription_status,
        case when p.suspended then 'suspended'
          when sub.status = 'past_due' then 'past_due'
          when sub.status = 'canceled' then 'canceled'
          when sub.status in ('active','trialing') then 'active'
          when now() < p.trial_ends_at then 'trial' else 'canceled' end status,
        case when p.suspended then 'none'
          when p.plan_override is not null and (p.plan_override_expires_at is null or p.plan_override_expires_at > now())
            and public.effective_plan(p.id) = p.plan_override then 'override'
          when sub.status in ('active','trialing') then 'subscription'
          when now() < p.trial_ends_at then 'trial' else 'none' end plan_source,
        coalesce(e.site_limit, 0) site_limit,
        (select count(*) from public.sites s where s.owner_id = p.id and s.status = 'active') sites_used
      from public.profiles p join auth.users au on au.id = p.id
      left join public.subscriptions sub on sub.owner_id = p.id
      left join public.plan_entitlements e on e.id = public.effective_plan(p.id)
      where ($1 = '' or p.email::text ilike '%%' || $1 || '%%' or p.display_name ilike '%%' || $1 || '%%')
    )
    select id,email,display_name,role,locale,effective_plan,plan_source,trial_ends_at,
      sites_used,site_limit,created_at,last_sign_in_at,status,plan_override,plan_override_expires_at
    from users where ($2 = 'all' or coalesce(effective_plan,'none') = $2)
      and ($3 = 'all' or status = $3) and ($4 = 'all' or role = $4)
    order by %I %s nulls last, id asc limit 26 offset $5
  $sql$, v_order, case when p_desc then 'desc' else 'asc' end)
  using p_search, p_plan, p_status, p_role, p_offset;
end;
$$;
revoke all on function public.admin_user_directory(text,text,text,text,text,boolean,integer) from public, anon, authenticated;
grant execute on function public.admin_user_directory(text,text,text,text,text,boolean,integer) to service_role;

-- Expired overrides need the same site reconciliation as an expired trial.
create or replace function public.enqueue_due_scans(p_limit integer default 100) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare r record; v_count integer := 0; v_interval integer; v_plan public.plan_id; v_scan public.scans%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 500 then raise exception 'invalid enqueue limit' using errcode = '22023'; end if;
  for r in select p.id from public.profiles p where not p.suspended and
    ((p.trial_ends_at <= now() and (p.plan_override is null or p.plan_override_expires_at <= now())
      and not exists (select 1 from public.subscriptions sub where sub.owner_id = p.id and sub.status in ('active','trialing')))
      or (p.plan_override_expires_at is not null and p.plan_override_expires_at <= now()))
    and (p.plan_override_expires_at is not null and p.plan_override_expires_at <= now()
      or exists (select 1 from public.sites s where s.owner_id = p.id and s.status = 'active'))
    limit p_limit loop
    update public.profiles set plan_override = null, plan_override_expires_at = null
      where id = r.id and plan_override_expires_at is not null and plan_override_expires_at <= now();
    perform public.sync_site_limit(r.id); perform public.sync_plan_access(r.id);
  end loop;
  if not coalesce((select enabled from public.feature_flags where key = 'automatic_scans'), false) then return 0; end if;
  if not coalesce((select enabled from public.feature_flags where key = 'automatic_scans'), false) then return 0; end if;
  for r in select s.* from public.sites s where s.status = 'active' and s.next_scan_at <= now()
    order by s.next_scan_at limit p_limit for update skip locked loop
    v_plan := public.effective_plan(r.owner_id);
    if v_plan is null then continue; end if;
    select greatest(coalesce(r.scan_interval_hours, e.scan_interval_hours), e.scan_interval_hours)
      into v_interval from public.plan_entitlements e where e.id = v_plan;
    begin
      v_scan := public.start_scan(r.id,
        case when r.verified_at is null or r.verification_due_at is null or r.verification_due_at <= now()
          then 'passive'::public.scan_kind else 'automatic'::public.scan_kind end,
        null, null, 0);
    exception when sqlstate 'SG001' then continue;
    end;
    update public.sites set next_scan_at = now() + make_interval(hours => v_interval) where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
