-- Privileged helpers are deliberately granted only where specified in 0003_security.sql.
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'plan_entitlements','profiles','teams','team_members','team_invites','client_workspaces',
    'sites','site_verifications','scans','scan_jobs','findings','finding_states',
    'scan_modules_results','share_links','api_keys','encrypted_secrets','subscriptions',
    'billing_events','notifications','notification_channels','blocked_domains',
    'abuse_reports','contact_messages','announcements','changelog_entries',
    'feature_flags','app_settings','data_exports'
  ] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role = 'admin' and not p.suspended from public.profiles p where p.id = (select auth.uid())), false);
$$;

create function public.is_team_member(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.team_members tm
    join public.profiles p on p.id = tm.user_id
    where tm.team_id = p_team and tm.user_id = (select auth.uid()) and not p.suspended
  ), false);
$$;

create function public.effective_plan(p_user uuid) returns public.plan_id
language sql stable security definer set search_path = '' as $$
  select case
    when p.suspended then null
    when p.plan_override is not null then p.plan_override
    when sub.status = 'active' then sub.plan_id
    when now() < p.trial_ends_at then 'pro'::public.plan_id
    else null
  end
  from public.profiles p
  left join public.subscriptions sub on sub.owner_id = p.id
  where p.id = p_user;
$$;

create function public.can_edit_team(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.team_members tm
    join public.profiles p on p.id = tm.user_id
    join public.teams t on t.id = tm.team_id
    where tm.team_id = p_team and tm.user_id = (select auth.uid())
      and tm.role in ('owner', 'member') and not p.suspended
      and public.effective_plan(t.owner_id) = 'agency'
  ), false);
$$;

create function public.can_view_site(p_site uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.sites s
    join public.profiles viewer on viewer.id = (select auth.uid())
    where s.id = p_site and not viewer.suspended
      and (s.owner_id = viewer.id or (s.team_id is not null and public.is_team_member(s.team_id)))
  ), false);
$$;

create function public.can_edit_site(p_site uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.sites s
    join public.profiles p on p.id = s.owner_id
    where s.id = p_site and not p.suspended and public.effective_plan(s.owner_id) is not null
      and (s.owner_id = (select auth.uid()) or (s.team_id is not null and public.can_edit_team(s.team_id)))
  ), false);
$$;

create function public.current_entitlements(p_user uuid)
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
      (p.plan_override is null and coalesce(sub.status <> 'active', true) and now() < p.trial_ends_at and not p.suspended),
      (v_plan is null), e.site_limit, e.manual_scans_per_month, e.history_days,
      e.team_member_limit, e.scan_interval_hours, e.features
    from public.profiles p
    left join public.subscriptions sub on sub.owner_id = p.id
    left join public.plan_entitlements e on e.id = v_plan
    where p.id = p_user;
end;
$$;

create function public.active_site_count(p_user uuid) returns integer
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_user is null or (auth.role() <> 'service_role' and p_user is distinct from auth.uid() and not public.is_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return (select count(*)::integer from public.sites where owner_id = p_user and status = 'active');
end;
$$;

create function public.manual_scan_count_this_month(p_user uuid) returns integer
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_user is null or (auth.role() <> 'service_role' and p_user is distinct from auth.uid() and not public.is_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return (
    select count(*)::integer from public.scans sc
    join public.sites s on s.id = sc.site_id
    where s.owner_id = p_user and sc.requested_by is not null and sc.kind in ('manual', 'api', 'passive')
      and sc.created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
  );
end;
$$;

create function public.team_seat_count(p_team uuid) returns integer
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_team is null or (auth.role() <> 'service_role' and not public.is_team_member(p_team) and not public.is_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return (select count(*)::integer from public.team_members where team_id = p_team);
end;
$$;

create function public.can_add_site(p_user uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_limit integer;
begin
  if p_user is null or (auth.role() <> 'service_role' and p_user is distinct from auth.uid() and not public.is_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select e.site_limit into v_limit from public.plan_entitlements e where e.id = public.effective_plan(p_user);
  return v_limit is not null and public.active_site_count(p_user) < v_limit;
end;
$$;

create function public.can_run_manual_scan(p_user uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_limit integer; v_plan public.plan_id;
begin
  if p_user is null or (auth.role() <> 'service_role' and p_user is distinct from auth.uid() and not public.is_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_plan := public.effective_plan(p_user);
  if v_plan is null then return false; end if;
  select e.manual_scans_per_month into v_limit from public.plan_entitlements e where e.id = v_plan;
  return v_limit is null or public.manual_scan_count_this_month(p_user) < v_limit;
end;
$$;

create function public.enforce_plan_feature() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_plan public.plan_id;
begin
  if tg_table_name in ('client_workspaces', 'team_invites') then
    select owner_id into v_owner from public.teams where id = new.team_id;
    v_plan := public.effective_plan(v_owner);
    if v_plan is distinct from 'agency'::public.plan_id then
      raise exception 'Agency plan required' using errcode = '23514';
    end if;
    if tg_table_name = 'team_invites' and not exists (
      select 1 from public.team_members tm join public.profiles p on p.id = tm.user_id
      where tm.team_id = new.team_id and tm.user_id = new.invited_by
        and tm.role in ('owner', 'member') and not p.suspended
    ) then raise exception 'inviter must belong to team' using errcode = '42501'; end if;
  elsif tg_table_name = 'notification_channels' then
    v_plan := public.effective_plan(new.owner_id);
    if new.enabled and (v_plan is null or v_plan not in ('pro', 'agency')) then
      raise exception 'Pro plan required' using errcode = '23514';
    end if;
  elsif tg_table_name = 'api_keys' then
    v_plan := public.effective_plan(new.owner_id);
    if v_plan is null or v_plan not in ('pro', 'agency') then
      raise exception 'Pro plan required' using errcode = '23514';
    end if;
    if v_plan = 'pro' and not (new.scopes <@ array['sites:read','scans:read','scans:write','reports:read']::text[]) then
      raise exception 'scope requires Agency plan' using errcode = '23514';
    end if;
  elsif tg_table_name = 'share_links' then
    select owner_id into v_owner from public.sites where id = new.site_id;
    if public.effective_plan(v_owner) is null then
      raise exception 'active plan required' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger enforce_workspace_plan before insert or update of team_id on public.client_workspaces
for each row execute function public.enforce_plan_feature();
create trigger enforce_invite_plan before insert or update of team_id on public.team_invites
for each row execute function public.enforce_plan_feature();
create trigger enforce_channel_plan before insert or update of owner_id, enabled on public.notification_channels
for each row execute function public.enforce_plan_feature();
create trigger enforce_api_key_plan before insert on public.api_keys
for each row execute function public.enforce_plan_feature();
create trigger enforce_share_link_plan before insert on public.share_links
for each row execute function public.enforce_plan_feature();

create function public.enforce_scan_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_site public.sites%rowtype; v_plan public.plan_id;
begin
  select * into v_site from public.sites where id = new.site_id for update;
  if not found or v_site.status <> 'active' then raise exception 'site is not active' using errcode = '23514'; end if;
  perform 1 from public.profiles where id = v_site.owner_id for update;
  v_plan := public.effective_plan(v_site.owner_id);
  if v_plan is null then raise exception 'account is read only' using errcode = '23514'; end if;
  if new.kind in ('manual', 'api') and new.requested_by is null then
    raise exception 'requester required' using errcode = '23514';
  end if;
  if new.requested_by is not null and new.requested_by <> v_site.owner_id and not exists (
    select 1 from public.team_members tm join public.profiles p on p.id = tm.user_id
    where tm.team_id = v_site.team_id and tm.user_id = new.requested_by
      and tm.role in ('owner', 'member') and not p.suspended
  ) then raise exception 'requester cannot scan site' using errcode = '42501'; end if;
  if new.kind in ('manual', 'api') or (new.kind = 'passive' and new.requested_by is not null) then
    if not public.can_run_manual_scan(v_site.owner_id) then raise exception 'manual scan limit reached' using errcode = '23514'; end if;
  end if;
  if new.kind = 'api' and v_plan = 'starter' then raise exception 'API scanning requires Pro' using errcode = '23514'; end if;
  if new.kind in ('automatic', 'manual', 'api') and
    (v_site.verified_at is null or v_site.verification_due_at is null or v_site.verification_due_at <= now()) then
    raise exception 'ownership verification required' using errcode = '23514';
  end if;
  if new.kind = 'automatic' and (v_site.next_scan_at is null or v_site.next_scan_at > now()) then
    raise exception 'automatic scan is not due' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger enforce_scan_request before insert on public.scans
for each row execute function public.enforce_scan_request();

create function public.is_blocked_domain(p_domain text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_domain text := lower(trim(trailing '.' from coalesce(p_domain, ''))); v_ip inet;
begin
  if v_domain = '' then return true; end if;
  if exists (
    select 1 from public.blocked_domains b where b.active and (
      (b.kind = 'exact' and v_domain = b.pattern) or
      (b.kind in ('suffix', 'tld') and (v_domain = b.pattern or right(v_domain, length(b.pattern) + 1) = '.' || b.pattern))
    )
  ) then return true; end if;
  begin
    v_ip := v_domain::inet;
    return exists (select 1 from public.blocked_domains b where b.active and b.kind = 'cidr' and v_ip <<= b.pattern::cidr);
  exception when invalid_text_representation then
    return false;
  end;
end;
$$;

create function public.enforce_site_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_limit integer; v_team_owner uuid; v_domain_changed boolean; v_count_needed boolean;
begin
  if new.team_id is null then new.workspace_id := null; end if;
  if new.team_id is not null then
    select owner_id into v_team_owner from public.teams where id = new.team_id;
    if v_team_owner is distinct from new.owner_id then raise exception 'site team owner mismatch' using errcode = '23514'; end if;
  end if;
  if tg_op = 'INSERT' then
    v_domain_changed := true;
    v_count_needed := true;
  else
    v_domain_changed := new.domain is distinct from old.domain;
    v_count_needed := new.owner_id is distinct from old.owner_id or (new.status = 'active' and old.status <> 'active');
  end if;
  if v_domain_changed then
    if public.is_blocked_domain(new.domain::text) then raise exception 'domain is blocked' using errcode = '23514'; end if;
  end if;
  if v_count_needed then
    perform 1 from public.profiles where id = new.owner_id for update;
    select e.site_limit into v_limit from public.plan_entitlements e where e.id = public.effective_plan(new.owner_id);
    if v_limit is null or (select count(*) from public.sites where owner_id = new.owner_id and status = 'active' and id <> new.id) >= v_limit then
      if new.status = 'active' then raise exception 'site limit reached' using errcode = '23514'; end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger enforce_site_limits before insert or update on public.sites
for each row execute function public.enforce_site_limits();

create function public.enforce_team_seats() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_limit integer;
begin
  select owner_id into v_owner from public.teams where id = new.team_id;
  if v_owner is null then raise exception 'team missing' using errcode = '23503'; end if;
  if (new.user_id = v_owner) <> (new.role = 'owner') then raise exception 'invalid owner membership' using errcode = '23514'; end if;
  perform 1 from public.profiles where id = v_owner for update;
  select e.team_member_limit into v_limit from public.plan_entitlements e where e.id = public.effective_plan(v_owner);
  if v_limit is null or (select count(*) from public.team_members where team_id = new.team_id and user_id <> new.user_id) >= v_limit then
    raise exception 'team seat limit reached' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger enforce_team_seats before insert or update on public.team_members
for each row execute function public.enforce_team_seats();

create function public.create_team_owner_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.effective_plan(new.owner_id) <> 'agency' then raise exception 'agency plan required' using errcode = '23514'; end if;
  insert into public.team_members(team_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;
create trigger create_team_owner_member after insert on public.teams
for each row execute function public.create_team_owner_member();

create function public.protect_team_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then raise exception 'team owner is immutable' using errcode = '23514'; end if;
  return new;
end;
$$;
create trigger protect_team_owner before update on public.teams
for each row execute function public.protect_team_owner();

create function public.protect_owner_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.teams where id = old.team_id and owner_id = old.user_id) then
    if new.role <> 'owner' or new.team_id <> old.team_id or new.user_id <> old.user_id then
      raise exception 'team owner membership is immutable' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger protect_owner_membership before update on public.team_members
for each row execute function public.protect_owner_membership();

create function public.protect_profile_privileges() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('postgres', 'service_role') and (
    new.email is distinct from old.email or new.role is distinct from old.role or
    new.trial_started_at is distinct from old.trial_started_at or new.trial_ends_at is distinct from old.trial_ends_at or
    new.suspended is distinct from old.suspended or new.plan_override is distinct from old.plan_override or
    new.created_at is distinct from old.created_at or new.email_unsubscribed_at is distinct from old.email_unsubscribed_at
  ) then raise exception 'protected profile fields' using errcode = '42501'; end if;
  return new;
end;
$$;
create trigger protect_profile_privileges before update on public.profiles
for each row execute function public.protect_profile_privileges();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(new.email)); v_claimed_count integer;
begin
  if v_email is null or position('@' in v_email) < 2 then raise exception 'valid email required' using errcode = '23514'; end if;
  if exists (select 1 from public.disposable_email_domains where domain = split_part(v_email, '@', 2)) then
    raise exception 'disposable email domains are not allowed' using errcode = '23514';
  end if;
  insert into public.trial_claims(email_hash) values (extensions.digest(v_email, 'sha256'))
    on conflict do nothing;
  get diagnostics v_claimed_count = row_count;
  insert into public.profiles(id, email, display_name, locale, trial_started_at, trial_ends_at)
  values (new.id, v_email, nullif(left(btrim(new.raw_user_meta_data->>'full_name'), 120), ''),
    case when new.raw_user_meta_data->>'locale' in ('en', 'az') then new.raw_user_meta_data->>'locale' else 'en' end,
    now(), case when v_claimed_count = 1 then now() + interval '3 days' else now() end);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create function public.handle_auth_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(new.email));
begin
  if new.email is distinct from old.email then
    if v_email is null or position('@' in v_email) < 2 or exists (
      select 1 from public.disposable_email_domains where domain = split_part(v_email, '@', 2)
    ) then raise exception 'email domain is not allowed' using errcode = '23514'; end if;
    insert into public.trial_claims(email_hash) values (extensions.digest(v_email, 'sha256'))
      on conflict do nothing;
    update public.profiles set email = v_email where id = new.id;
  end if;
  return new;
end;
$$;
create trigger on_auth_user_email_changed after update of email on auth.users
for each row execute function public.handle_auth_email_change();

create function public.sync_site_limit(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_limit integer; v_changed integer;
begin
  if p_user is null then raise exception 'owner required' using errcode = '22023'; end if;
  perform 1 from public.profiles where id = p_user for update;
  select coalesce(e.site_limit, 0) into v_limit
    from public.profiles p left join public.plan_entitlements e on e.id = public.effective_plan(p.id)
    where p.id = p_user;
  with ranked as (
    select id, row_number() over (order by verified_at desc nulls last, created_at, id) as rn
    from public.sites where owner_id = p_user and status = 'active'
  )
  update public.sites s set status = 'paused', paused_reason = 'plan_limit', next_scan_at = null
  from ranked r where s.id = r.id and r.rn > coalesce(v_limit, 0);
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

create function public.sync_plan_access(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_plan public.plan_id; v_team uuid;
begin
  if p_user is null then raise exception 'owner required' using errcode = '22023'; end if;
  v_plan := public.effective_plan(p_user);
  if v_plan is null or v_plan = 'starter' then
    update public.api_keys set revoked_at = now() where owner_id = p_user and revoked_at is null;
    update public.notification_channels set enabled = false where owner_id = p_user and enabled;
  elsif v_plan = 'pro' then
    update public.api_keys set revoked_at = now()
    where owner_id = p_user and revoked_at is null
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

create function public.on_entitlement_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_site_limit(old.owner_id);
    perform public.sync_plan_access(old.owner_id);
    return old;
  end if;
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    perform public.sync_site_limit(old.owner_id);
    perform public.sync_plan_access(old.owner_id);
  end if;
  perform public.sync_site_limit(new.owner_id);
  perform public.sync_plan_access(new.owner_id);
  return new;
end;
$$;
create trigger on_subscription_entitlement_change after insert or update of plan_id, status, owner_id or delete on public.subscriptions
for each row execute function public.on_entitlement_change();

create function public.on_profile_entitlement_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.sync_site_limit(new.id);
  perform public.sync_plan_access(new.id);
  return new;
end;
$$;
create trigger on_profile_entitlement_change after update of plan_override, trial_ends_at, suspended on public.profiles
for each row execute function public.on_profile_entitlement_change();

create function public.rate_limit_check(p_key text, p_limit integer, p_window interval) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_hash bytea; v_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_key is null or length(p_key) > 512 or length(p_key) = 0 or p_limit is null or p_limit not between 1 and 10000
    or p_window is null or p_window <= interval '0 seconds' or p_window > interval '24 hours' then
    raise exception 'invalid rate limit parameters' using errcode = '22023';
  end if;
  v_hash := extensions.digest(p_key, 'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key, 0));
  select count(*) into v_count from public.rate_limits where key_hash = v_hash and occurred_at > now() - p_window;
  if v_count >= p_limit then return false; end if;
  insert into public.rate_limits(key_hash) values (v_hash);
  return true;
end;
$$;

create function public.claim_scan_jobs(p_limit integer, p_worker text, p_lease_seconds integer default 180)
returns setof public.scan_jobs
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 50 or length(coalesce(p_worker, '')) not between 1 and 120
    or p_lease_seconds is null or p_lease_seconds not between 30 and 900 then
    raise exception 'invalid claim parameters' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(74163723);
  return query
    with capacity as (
      select greatest(0, 50 - count(*)::integer) as free_slots from public.scan_jobs where status = 'running'
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
             where running.status = 'running' and owner_site.owner_id = s.owner_id) < 2
      order by j.priority desc, j.available_at, j.created_at
      limit p_limit * 50
      for update of j skip locked
    ), candidates as (
      select lc.id, lc.owner_id,
        row_number() over (partition by lc.owner_id order by lc.priority desc, lc.available_at, lc.created_at) as owner_rank
      from locked_candidates lc
    ), picked as (
      select c.id from candidates c, capacity cap
      where c.owner_rank <= 2 - (
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

create function public.recover_stuck_jobs(p_limit integer default 100) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_changed integer;
begin
  if auth.role() <> 'service_role' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 1000 then raise exception 'invalid recovery limit' using errcode = '22023'; end if;
  with expired as (
    select id from public.scan_jobs where status = 'running' and lease_expires_at < now()
    order by lease_expires_at limit p_limit for update skip locked
  ), recovered as (
    update public.scan_jobs j
    set status = case when j.attempts >= j.max_attempts then 'dead'::public.job_status else 'queued'::public.job_status end,
      available_at = now() + make_interval(secs => least(3600, 30 * power(2::numeric, least(j.attempts, 7))::integer)),
      locked_at = null, locked_by = null, lease_expires_at = null, last_error_code = 'lease_expired'
    where j.id in (select id from expired) returning j.scan_id, j.status
  ), failed_scans as (
    update public.scans sc set status = 'failed', failure_code = 'job_retries_exhausted', completed_at = now()
    where sc.id in (select scan_id from recovered where status = 'dead') and sc.status in ('queued', 'running')
    returning sc.id
  ), canceled_jobs as (
    update public.scan_jobs j set status = 'canceled', completed_at = now(),
      locked_at = null, locked_by = null, lease_expires_at = null
    where j.scan_id in (select id from failed_scans) and j.status in ('queued', 'running')
      and j.id not in (select id from expired)
    returning j.id
  ) select count(*) into v_changed from recovered;
  update public.scan_jobs j set status = 'canceled', completed_at = now()
  from public.scans sc where sc.id = j.scan_id and sc.status = 'failed' and j.status = 'queued';
  return v_changed;
end;
$$;

create function public.enqueue_due_scans(p_limit integer default 100) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare r record; v_scan uuid; v_count integer := 0; v_interval integer;
begin
  if auth.role() <> 'service_role' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 500 then raise exception 'invalid enqueue limit' using errcode = '22023'; end if;
  -- Expired trials have no timer trigger; the scheduler closes them before queuing work.
  for r in select p.id from public.profiles p where p.trial_ends_at <= now()
    and p.plan_override is null and not p.suspended
    and not exists (select 1 from public.subscriptions sub where sub.owner_id = p.id and sub.status = 'active')
    and exists (select 1 from public.sites s where s.owner_id = p.id and s.status = 'active')
    limit p_limit loop
    perform public.sync_site_limit(r.id);
    perform public.sync_plan_access(r.id);
  end loop;
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

create function public.purge_expired_scan_history(p_limit integer default 500) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 5000 then raise exception 'invalid purge limit' using errcode = '22023'; end if;
  with old_scans as (
    select sc.id from public.scans sc
    join public.sites s on s.id = sc.site_id
    left join public.plan_entitlements e on e.id = public.effective_plan(s.owner_id)
    where sc.created_at < now() - make_interval(days => coalesce(e.history_days, 30))
      and sc.status in ('completed', 'failed', 'canceled')
    order by sc.created_at limit p_limit for update of sc skip locked
  ), removed as (
    delete from public.scans where id in (select id from old_scans) returning id
  ) select count(*) into v_count from removed;
  delete from public.rate_limits where occurred_at < now() - interval '24 hours';
  return v_count;
end;
$$;
