-- SiteGuard base schema. Apply files in numeric order.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create type public.plan_id as enum ('starter', 'pro', 'agency');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'paused', 'canceled');
create type public.severity as enum ('critical', 'high', 'medium', 'low', 'info');
create type public.finding_status as enum ('open', 'fixed', 'ignored', 'accepted');
create type public.scan_status as enum ('queued', 'running', 'completed', 'failed', 'canceled');
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'dead', 'canceled');
create type public.verification_method as enum ('dns_txt', 'meta_tag', 'well_known_file');
create type public.verification_status as enum ('pending', 'verified', 'failed', 'expired');
create type public.team_role as enum ('owner', 'member', 'viewer');
create type public.user_role as enum ('user', 'admin');
create type public.notification_type as enum ('welcome', 'trial_reminder', 'trial_expired', 'scan_completed', 'finding_alert', 'score_regression', 'verification_failed', 'payment_failed', 'subscription_changed', 'system');
create type public.channel_type as enum ('slack', 'discord', 'webhook');
create type public.site_status as enum ('active', 'paused');
create type public.scan_kind as enum ('automatic', 'manual', 'passive', 'api');
create type public.message_status as enum ('new', 'in_progress', 'resolved', 'spam');
create type public.export_status as enum ('queued', 'processing', 'completed', 'failed', 'expired');
create type public.billing_period as enum ('monthly', 'annual');
create type public.domain_rule_kind as enum ('exact', 'suffix', 'tld', 'cidr');

create table public.plan_entitlements (
  id public.plan_id primary key,
  site_limit integer not null check (site_limit > 0),
  manual_scans_per_month integer check (manual_scans_per_month > 0),
  history_days integer not null check (history_days > 0),
  team_member_limit integer not null check (team_member_limit > 0),
  scan_interval_hours integer not null check (scan_interval_hours > 0),
  features jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email extensions.citext not null unique,
  display_name text check (display_name is null or length(display_name) <= 120),
  avatar_path text,
  role public.user_role not null default 'user',
  locale text not null default 'en' check (locale in ('en', 'az')),
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '3 days'),
  suspended boolean not null default false,
  plan_override public.plan_id,
  notification_preferences jsonb not null default '{"email":true,"scanCompleted":true,"findingAlerts":true,"trialReminders":true,"productUpdates":false}'::jsonb check (jsonb_typeof(notification_preferences) = 'object'),
  email_unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trial_dates_ordered check (trial_ends_at >= trial_started_at)
);
create index profiles_trial_ends_idx on public.profiles(trial_ends_at) where suspended = false;

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.team_role not null,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members(user_id, team_id);

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email extensions.citext not null,
  role public.team_role not null check (role <> 'owner'),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  invited_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (accepted_at is null or revoked_at is null)
);
create unique index team_invites_pending_idx on public.team_invites(team_id, email) where accepted_at is null and revoked_at is null;
create index team_invites_email_idx on public.team_invites(email, expires_at);

create table public.client_workspaces (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  client_name text check (client_name is null or length(client_name) <= 120),
  logo_path text,
  brand_color text check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, team_id)
);
create index client_workspaces_team_idx on public.client_workspaces(team_id);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  workspace_id uuid,
  name text not null check (length(btrim(name)) between 1 and 120),
  normalized_url text not null check (normalized_url ~ '^https?://'),
  domain extensions.citext not null check (length(domain::text) between 1 and 253),
  status public.site_status not null default 'active',
  paused_reason text,
  verified_at timestamptz,
  verification_due_at timestamptz,
  next_scan_at timestamptz,
  last_scan_at timestamptz,
  last_score integer check (last_score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (workspace_id, team_id) references public.client_workspaces(id, team_id) on delete set null (workspace_id),
  check (workspace_id is null or team_id is not null),
  check ((status = 'active' and paused_reason is null) or (status = 'paused' and paused_reason is not null))
);
create unique index sites_verified_domain_idx on public.sites(domain) where verified_at is not null;
create index sites_owner_status_idx on public.sites(owner_id, status, created_at);
create index sites_team_idx on public.sites(team_id) where team_id is not null;
create index sites_due_idx on public.sites(next_scan_at) where status = 'active';
create index sites_verification_due_idx on public.sites(verification_due_at) where verified_at is not null;

create table public.site_verifications (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  method public.verification_method not null,
  challenge_value text not null check (length(challenge_value) between 16 and 256),
  status public.verification_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  expires_at timestamptz not null,
  checked_at timestamptz,
  verified_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index site_verifications_site_idx on public.site_verifications(site_id, created_at desc);
create index site_verifications_pending_idx on public.site_verifications(expires_at) where status = 'pending';

create table public.scans (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  kind public.scan_kind not null,
  status public.scan_status not null default 'queued',
  idempotency_key text unique,
  score integer check (score between 0 and 100),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  started_at timestamptz,
  completed_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, site_id),
  check (completed_at is null or started_at is not null)
);
create index scans_site_created_idx on public.scans(site_id, created_at desc);
create unique index scans_one_active_per_site_idx on public.scans(site_id) where status in ('queued', 'running');
create index scans_status_created_idx on public.scans(status, created_at) where status in ('queued', 'running');
create index scans_requester_month_idx on public.scans(requested_by, created_at) where requested_by is not null;

create table public.scan_jobs (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  module_key text not null,
  step_key text not null,
  status public.job_status not null default 'queued',
  priority integer not null default 0,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  lease_expires_at timestamptz,
  progress jsonb not null default '{}'::jsonb check (jsonb_typeof(progress) = 'object'),
  last_error_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scan_id, module_key, step_key)
);
create index scan_jobs_claim_idx on public.scan_jobs(priority desc, available_at, created_at) where status = 'queued';
create index scan_jobs_lease_idx on public.scan_jobs(lease_expires_at) where status = 'running';
create index scan_jobs_scan_idx on public.scan_jobs(scan_id, status);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  finding_key text not null,
  fingerprint text not null,
  severity public.severity not null,
  score_weight numeric(6,2) not null default 0 check (score_weight between 0 and 100),
  affected_asset text,
  title_key text not null,
  description_key text not null,
  impact_key text not null,
  fix_key text not null,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  fix_snippets jsonb not null default '{}'::jsonb check (jsonb_typeof(fix_snippets) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  first_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (scan_id, site_id) references public.scans(id, site_id) on delete cascade,
  unique (scan_id, fingerprint)
);
create index findings_site_fingerprint_idx on public.findings(site_id, fingerprint, created_at desc);
create index findings_scan_severity_idx on public.findings(scan_id, severity);

create table public.finding_states (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  fingerprint text not null,
  status public.finding_status not null default 'open',
  reason text,
  changed_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, fingerprint),
  check (status not in ('ignored', 'accepted') or length(btrim(coalesce(reason, ''))) between 1 and 2000)
);
create index finding_states_site_status_idx on public.finding_states(site_id, status);

create table public.scan_modules_results (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  module_key text not null,
  status public.scan_status not null default 'queued',
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scan_id, module_key)
);

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  scan_id uuid references public.scans(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  token_prefix text not null check (length(token_prefix) between 6 and 16),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (scan_id, site_id) references public.scans(id, site_id) on delete cascade
);
create index share_links_site_idx on public.share_links(site_id, created_at desc);
create index share_links_scan_idx on public.share_links(scan_id) where scan_id is not null;
create index share_links_expiry_idx on public.share_links(expires_at) where revoked_at is null;

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  key_prefix text not null unique check (length(key_prefix) between 8 and 32),
  key_hash bytea not null unique check (octet_length(key_hash) = 32),
  scopes text[] not null default '{}' check (scopes <@ array['sites:read','scans:read','scans:write','reports:read','exports:read','ci:write']::text[]),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index api_keys_owner_idx on public.api_keys(owner_id, created_at desc);

create table public.encrypted_secrets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  site_id uuid references public.sites(id) on delete cascade,
  kind text not null check (length(kind) between 1 and 80),
  key_version integer not null check (key_version > 0),
  ciphertext bytea not null check (octet_length(ciphertext) > 0),
  iv bytea not null check (octet_length(iv) = 12),
  tag bytea not null check (octet_length(tag) = 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (site_id, owner_id) references public.sites(id, owner_id) on delete cascade
);
create index encrypted_secrets_owner_idx on public.encrypted_secrets(owner_id, kind);
create index encrypted_secrets_site_idx on public.encrypted_secrets(site_id) where site_id is not null;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  plan_id public.plan_id not null,
  status public.subscription_status not null,
  billing_period public.billing_period not null,
  paddle_subscription_id text unique,
  paddle_customer_id text,
  billing_country char(2) check (billing_country is null or billing_country ~ '^[A-Z]{2}$'),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_status_idx on public.subscriptions(status, plan_id);
create index subscriptions_customer_idx on public.subscriptions(paddle_customer_id) where paddle_customer_id is not null;

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  provider_event_id text not null unique,
  event_type text not null,
  owner_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  processing_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index billing_events_owner_idx on public.billing_events(owner_id, created_at desc);
create index billing_events_unprocessed_idx on public.billing_events(created_at) where processed_at is null;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  site_id uuid references public.sites(id) on delete cascade,
  type public.notification_type not null,
  title_key text not null,
  body_key text not null,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  read_at timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notifications_user_unread_idx on public.notifications(user_id, created_at desc) where read_at is null;
create index notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index notifications_site_idx on public.notifications(site_id) where site_id is not null;

create table public.notification_channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  site_id uuid references public.sites(id) on delete cascade,
  type public.channel_type not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  url_secret_id uuid not null,
  signing_secret_id uuid,
  enabled boolean not null default true,
  last_delivered_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (site_id, owner_id) references public.sites(id, owner_id) on delete cascade,
  foreign key (url_secret_id, owner_id) references public.encrypted_secrets(id, owner_id) on delete cascade,
  foreign key (signing_secret_id, owner_id) references public.encrypted_secrets(id, owner_id) on delete cascade,
  check (signing_secret_id is distinct from url_secret_id),
  check (type <> 'webhook' or signing_secret_id is not null)
);
create index notification_channels_owner_idx on public.notification_channels(owner_id, enabled);
create index notification_channels_site_idx on public.notification_channels(site_id) where site_id is not null;
create index notification_channels_url_secret_idx on public.notification_channels(url_secret_id);
create index notification_channels_signing_secret_idx on public.notification_channels(signing_secret_id) where signing_secret_id is not null;

create table public.blocked_domains (
  id uuid primary key default gen_random_uuid(),
  pattern text not null,
  kind public.domain_rule_kind not null,
  reason text not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, pattern)
);
create index blocked_domains_active_idx on public.blocked_domains(kind, pattern) where active;

create table public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  reporter_email extensions.citext,
  target_url text,
  details text not null check (length(btrim(details)) between 10 and 10000),
  status public.message_status not null default 'new',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index abuse_reports_status_idx on public.abuse_reports(status, created_at desc);
create index abuse_reports_reporter_idx on public.abuse_reports(reporter_id) where reporter_id is not null;
create index abuse_reports_site_idx on public.abuse_reports(site_id) where site_id is not null;

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 120),
  email extensions.citext not null,
  subject text not null check (length(btrim(subject)) between 1 and 200),
  body text not null check (length(btrim(body)) between 1 and 10000),
  status public.message_status not null default 'new',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contact_messages_status_idx on public.contact_messages(status, created_at desc);
create index contact_messages_user_idx on public.contact_messages(user_id) where user_id is not null;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title_en text not null,
  title_az text not null,
  body_en text not null,
  body_az text not null,
  link_url text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  published boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index announcements_live_idx on public.announcements(starts_at, ends_at) where published;

create table public.changelog_entries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title_en text not null,
  title_az text not null,
  body_en text not null,
  body_az text not null,
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index changelog_published_idx on public.changelog_entries(published_at desc) where published_at is not null;

create table public.feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  enabled boolean not null default false,
  description text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value jsonb not null,
  description text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_table text,
  target_id text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  ip_address inet,
  created_at timestamptz not null default now()
);
create index admin_audit_actor_idx on public.admin_audit_log(actor_id, created_at desc);
create index admin_audit_created_idx on public.admin_audit_log(created_at desc);

create table public.rate_limits (
  key_hash bytea not null check (octet_length(key_hash) = 32),
  occurred_at timestamptz not null default now()
);
create index rate_limits_key_time_idx on public.rate_limits(key_hash, occurred_at desc);
create index rate_limits_time_idx on public.rate_limits(occurred_at);

create table public.disposable_email_domains (
  domain extensions.citext primary key,
  created_at timestamptz not null default now()
);

-- Retained after account deletion to prevent repeat trials for the same email.
create table public.trial_claims (
  email_hash bytea primary key check (octet_length(email_hash) = 32),
  first_claimed_at timestamptz not null default now()
);

create table public.data_exports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  format text not null check (format in ('json', 'csv')),
  scope text not null check (scope in ('account', 'sites', 'findings', 'scans')),
  status public.export_status not null default 'queued',
  storage_path text,
  expires_at timestamptz,
  error_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index data_exports_owner_idx on public.data_exports(owner_id, created_at desc);
create index data_exports_expiry_idx on public.data_exports(expires_at) where expires_at is not null;
