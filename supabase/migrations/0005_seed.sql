-- Database mirror of lib/plans.ts. Phase 3 must keep the typed application config in sync.
insert into public.plan_entitlements(id, site_limit, manual_scans_per_month, history_days, team_member_limit, scan_interval_hours, features)
values
  ('starter', 1, 3, 30, 1, 168,
   '{"automaticScans":true,"manualScans":true,"emailAlerts":true,"standardFixGuides":true,"publicScoreLink":true,"slackAlerts":false,"discordAlerts":false,"webhookAlerts":false,"generatedFixes":false,"pdfReports":false,"scoreBadge":false,"scanComparison":false,"priorityEmailSupport":false,"priorityQueue":false,"whiteLabelReports":false,"team":false,"clientWorkspaces":false,"fullApi":false,"ciEndpoint":false,"csvExport":false,"jsonExport":false,"limitedApi":false}'::jsonb),
  ('pro', 5, null, 90, 1, 24,
   '{"automaticScans":true,"manualScans":true,"emailAlerts":true,"standardFixGuides":true,"publicScoreLink":true,"slackAlerts":true,"discordAlerts":true,"webhookAlerts":true,"generatedFixes":true,"pdfReports":true,"scoreBadge":true,"scanComparison":true,"priorityEmailSupport":true,"priorityQueue":false,"whiteLabelReports":false,"team":false,"clientWorkspaces":false,"fullApi":false,"ciEndpoint":false,"csvExport":false,"jsonExport":false,"limitedApi":true}'::jsonb),
  ('agency', 25, null, 365, 5, 24,
   '{"automaticScans":true,"manualScans":true,"emailAlerts":true,"standardFixGuides":true,"publicScoreLink":true,"slackAlerts":true,"discordAlerts":true,"webhookAlerts":true,"generatedFixes":true,"pdfReports":true,"scoreBadge":true,"scanComparison":true,"priorityEmailSupport":true,"priorityQueue":true,"whiteLabelReports":true,"team":true,"clientWorkspaces":true,"fullApi":true,"ciEndpoint":true,"csvExport":true,"jsonExport":true,"limitedApi":true}'::jsonb)
on conflict (id) do nothing;

insert into public.disposable_email_domains(domain) values
  ('10minutemail.com'),('dispostable.com'),('emailondeck.com'),('fakeinbox.com'),
  ('getnada.com'),('guerrillamail.com'),('maildrop.cc'),('mailinator.com'),
  ('minutemail.com'),('mohmal.com'),('sharklasers.com'),('temp-mail.org'),
  ('tempmail.com'),('throwawaymail.com'),('trashmail.com'),('yopmail.com')
on conflict do nothing;

insert into public.blocked_domains(kind, pattern, reason) values
  ('exact','localhost','Local target'),('exact','metadata.google.internal','Cloud metadata'),
  ('exact','metadata.azure.internal','Cloud metadata'),
  ('tld','local','Local target'),('tld','internal','Internal target'),
  ('tld','localhost','Local target'),('tld','test','Reserved domain'),
  ('tld','invalid','Reserved domain'),('tld','example','Reserved domain'),
  ('tld','onion','Non-public target'),
  ('tld','gov','Government target'),('suffix','gov.az','Government target'),
  ('suffix','gov.uk','Government target'),('suffix','gouv.fr','Government target'),
  ('tld','mil','Military target'),('tld','bank','Banking target'),
  ('suffix','bank.az','Banking target'),('suffix','bank.gov','Banking target'),
  ('suffix','google.com','Major platform'),('suffix','youtube.com','Major platform'),
  ('suffix','facebook.com','Major platform'),('suffix','instagram.com','Major platform'),
  ('suffix','whatsapp.com','Major platform'),('suffix','microsoft.com','Major platform'),
  ('suffix','github.com','Major platform'),('suffix','gitlab.com','Major platform'),
  ('suffix','amazon.com','Major platform'),('suffix','amazonaws.com','Major platform'),
  ('suffix','cloudflare.com','Major platform'),('suffix','supabase.com','Major platform'),
  ('suffix','vercel.com','Major platform'),('suffix','apple.com','Major platform'),
  ('suffix','paypal.com','Financial platform'),('suffix','stripe.com','Financial platform'),
  ('suffix','paddle.com','Financial platform'),('suffix','nip.io','Wildcard IP DNS'),
  ('suffix','sslip.io','Wildcard IP DNS'),
  ('cidr','0.0.0.0/8','Non-public IP range'),('cidr','10.0.0.0/8','Private IP range'),
  ('cidr','100.64.0.0/10','Carrier-grade NAT range'),('cidr','127.0.0.0/8','Loopback IP range'),
  ('cidr','169.254.0.0/16','Link-local and metadata IP range'),
  ('cidr','172.16.0.0/12','Private IP range'),('cidr','192.168.0.0/16','Private IP range'),
  ('cidr','192.0.0.0/24','Reserved IP range'),('cidr','192.0.2.0/24','Documentation IP range'),
  ('cidr','198.18.0.0/15','Benchmark IP range'),('cidr','224.0.0.0/4','Multicast IP range'),
  ('cidr','198.51.100.0/24','Documentation IP range'),('cidr','203.0.113.0/24','Documentation IP range'),
  ('cidr','240.0.0.0/4','Reserved IP range'),('cidr','::/128','Unspecified IP'),
  ('cidr','::1/128','Loopback IP'),('cidr','fc00::/7','Private IPv6 range'),
  ('cidr','fe80::/10','Link-local IPv6 range'),('cidr','ff00::/8','Multicast IPv6 range'),
  ('cidr','2001:db8::/32','Documentation IPv6 range')
on conflict (kind, pattern) do nothing;

insert into public.feature_flags(key, enabled, description) values
  ('public_passive_check', true, 'Allow the public passive check widget'),
  ('manual_scans', true, 'Allow manual scan requests'),
  ('automatic_scans', true, 'Allow scheduled scans'),
  ('api_access', true, 'Allow API key endpoints'),
  ('team_invites', true, 'Allow Agency team invitations')
on conflict (key) do nothing;

insert into public.app_settings(key, value, description) values
  ('maintenance_mode', 'false'::jsonb, 'Put user-facing application routes into maintenance mode'),
  ('global_scan_concurrency', '50'::jsonb, 'Maximum simultaneously running scan jobs'),
  ('per_user_scan_concurrency', '2'::jsonb, 'Maximum simultaneously running scan jobs per owner'),
  ('verification_recheck_days', '30'::jsonb, 'Days between ownership rechecks'),
  ('public_check_rate_per_hour', '10'::jsonb, 'Maximum passive checks per IP per hour')
on conflict (key) do nothing;
