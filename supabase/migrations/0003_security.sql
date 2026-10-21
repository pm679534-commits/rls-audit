-- All public tables are private by default. Service-role access is explicit; RLS still
-- protects every table if a client accidentally receives a normal authenticated token.
do $$
declare t text;
begin
  for t in select tablename from pg_catalog.pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end;
$$;
revoke all on all functions in schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
grant usage on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

grant select on public.plan_entitlements to anon, authenticated;
create policy plan_entitlements_read on public.plan_entitlements for select to anon, authenticated using (true);

grant select on public.profiles to authenticated;
grant update (display_name, avatar_path, locale, notification_preferences) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) and not suspended)
  with check (id = (select auth.uid()) and not suspended);

grant select on public.teams, public.team_members, public.team_invites, public.client_workspaces to authenticated;
create policy teams_read on public.teams for select to authenticated
  using (public.is_team_member(id) or public.is_admin());
create policy team_members_read on public.team_members for select to authenticated
  using (public.is_team_member(team_id) or public.is_admin());
create policy team_invites_read on public.team_invites for select to authenticated
  using (public.can_edit_team(team_id) or public.is_admin());
create policy client_workspaces_read on public.client_workspaces for select to authenticated
  using (public.is_team_member(team_id) or public.is_admin());

grant select on public.sites, public.site_verifications, public.scans,
  public.findings, public.finding_states, public.scan_modules_results, public.share_links to authenticated;
create policy sites_read on public.sites for select to authenticated
  using (public.can_view_site(id) or public.is_admin());
create policy site_verifications_read on public.site_verifications for select to authenticated
  using (public.can_view_site(site_id) or public.is_admin());
create policy scans_read on public.scans for select to authenticated
  using (public.can_view_site(site_id) or public.is_admin());
create policy findings_read on public.findings for select to authenticated
  using (public.can_view_site(site_id) or public.is_admin());
create policy finding_states_read on public.finding_states for select to authenticated
  using (public.can_view_site(site_id) or public.is_admin());
create policy scan_modules_results_read on public.scan_modules_results for select to authenticated
  using (exists (select 1 from public.scans sc where sc.id = scan_id and public.can_view_site(sc.site_id)) or public.is_admin());
create policy share_links_read on public.share_links for select to authenticated
  using (public.can_view_site(site_id) or public.is_admin());

grant select on public.api_keys, public.subscriptions, public.notifications,
  public.notification_channels, public.data_exports to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy api_keys_read on public.api_keys for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin());
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin());
create policy notifications_read on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notification_channels_read on public.notification_channels for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin());
create policy data_exports_read on public.data_exports for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin());

grant select on public.billing_events, public.blocked_domains, public.abuse_reports,
  public.contact_messages, public.feature_flags, public.app_settings,
  public.admin_audit_log to authenticated;
create policy billing_events_admin_read on public.billing_events for select to authenticated using (public.is_admin());
create policy blocked_domains_admin_read on public.blocked_domains for select to authenticated using (public.is_admin());
create policy abuse_reports_admin_read on public.abuse_reports for select to authenticated using (public.is_admin());
create policy contact_messages_admin_read on public.contact_messages for select to authenticated using (public.is_admin());
create policy feature_flags_admin_read on public.feature_flags for select to authenticated using (public.is_admin());
create policy app_settings_admin_read on public.app_settings for select to authenticated using (public.is_admin());
create policy admin_audit_log_admin_read on public.admin_audit_log for select to authenticated using (public.is_admin());

grant select on public.announcements, public.changelog_entries to anon, authenticated;
create policy announcements_public_read on public.announcements for select to anon, authenticated
  using ((published and starts_at <= now() and (ends_at is null or ends_at > now())) or public.is_admin());
create policy changelog_public_read on public.changelog_entries for select to anon, authenticated
  using (published_at is not null and published_at <= now() or public.is_admin());

-- scan_jobs, encrypted_secrets, rate_limits, disposable_email_domains and trial_claims
-- have no client grants or policies. Only the service role can access them.
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.can_edit_team(uuid) to authenticated;
grant execute on function public.can_view_site(uuid) to authenticated;
grant execute on function public.can_edit_site(uuid) to authenticated;
grant execute on function public.current_entitlements(uuid) to authenticated;
grant execute on function public.active_site_count(uuid) to authenticated;
grant execute on function public.manual_scan_count_this_month(uuid) to authenticated;
grant execute on function public.team_seat_count(uuid) to authenticated;
grant execute on function public.can_add_site(uuid) to authenticated;
grant execute on function public.can_run_manual_scan(uuid) to authenticated;
