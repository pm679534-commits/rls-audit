alter table public.sites
  add column scan_interval_hours integer check (scan_interval_hours in (24, 168, 720)),
  add column enabled_modules text[] not null default array['general-web','nextjs','supabase']::text[]
    check (enabled_modules <@ array['general-web','nextjs','supabase']::text[] and cardinality(enabled_modules) > 0);

create function public.enforce_site_scan_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_min integer;
begin
  if new.scan_interval_hours is not null then
    select e.scan_interval_hours into v_min from public.plan_entitlements e
    where e.id = public.effective_plan(new.owner_id);
    if v_min is null or new.scan_interval_hours < v_min then
      raise exception 'scan interval exceeds plan' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger enforce_site_scan_settings before insert or update of scan_interval_hours, owner_id on public.sites
for each row execute function public.enforce_site_scan_settings();

alter table public.data_exports drop constraint data_exports_format_check;
alter table public.data_exports add constraint data_exports_format_check check (format in ('json', 'csv', 'pdf'));
alter table public.data_exports drop constraint data_exports_scope_check;
alter table public.data_exports add constraint data_exports_scope_check check (scope in ('account', 'sites', 'findings', 'scans', 'report'));
alter table public.data_exports add column site_id uuid references public.sites(id) on delete cascade;
alter table public.data_exports add column scan_id uuid references public.scans(id) on delete cascade;
alter table public.data_exports add constraint data_exports_report_target_check check
  ((scope = 'report' and site_id is not null and scan_id is not null) or (scope <> 'report' and site_id is null and scan_id is null));
alter table public.data_exports add constraint data_exports_scan_site_fkey foreign key (scan_id, site_id)
  references public.scans(id, site_id) on delete cascade;
create index data_exports_scan_idx on public.data_exports(scan_id, created_at desc) where scope = 'report';
create unique index data_exports_pending_report_idx on public.data_exports(owner_id, scan_id, format)
  where scope = 'report' and status in ('queued', 'processing');

create or replace function public.enqueue_due_scans(p_limit integer default 100) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare r record; v_scan uuid; v_count integer := 0; v_interval integer;
begin
  if auth.role() <> 'service_role' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 500 then raise exception 'invalid enqueue limit' using errcode = '22023'; end if;
  for r in select p.id from public.profiles p where p.trial_ends_at <= now()
    and p.plan_override is null and not p.suspended
    and not exists (select 1 from public.subscriptions sub where sub.owner_id = p.id and sub.status in ('active', 'trialing'))
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
    select greatest(coalesce(r.scan_interval_hours, e.scan_interval_hours), e.scan_interval_hours) into v_interval
      from public.plan_entitlements e where e.id = public.effective_plan(r.owner_id);
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
