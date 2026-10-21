import 'server-only';

import {z} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import {PLANS, type BillingPeriod, type PlanId} from '@/lib/plans';
import type {Tables} from '@/types/database';

const metricSchema = z.object({
  signups: z.number(), trialsStarted: z.number(), trialsConverted: z.number(), churned: z.number(),
  queueDepth: z.number(), runningJobs: z.number(), failedScans: z.number(), finishedScans: z.number(),
  subscriptionMix: z.array(z.object({plan: z.enum(['starter','pro','agency']), period: z.enum(['monthly','annual']), count: z.number()})),
  daily: z.array(z.object({day: z.string(), signups: z.number(), scans: z.number(), failed: z.number()}))
});

export async function adminOverview() {
  await requireAdmin();
  const {data, error} = await createAdminClient().rpc('admin_dashboard_metrics', {p_days: 30});
  if (error) throw new Error('Could not load admin metrics');
  const metrics = metricSchema.parse(data);
  const active = Object.fromEntries((['starter','pro','agency'] as const).map((plan) => [plan, metrics.subscriptionMix.filter((row) => row.plan === plan).reduce((n, row) => n + row.count, 0)])) as Record<PlanId, number>;
  const mrr = metrics.subscriptionMix.reduce((sum, row) => sum + row.count * PLANS[row.plan].priceEur[row.period as BillingPeriod] / (row.period === 'annual' ? 12 : 1), 0);
  return {...metrics, active, mrr: Math.round(mrr), failureRate: metrics.finishedScans ? Math.round(metrics.failedScans / metrics.finishedScans * 100) : 0};
}

export const adminFilterSchema = z.object({q: z.string().trim().max(120).default(''), status: z.string().max(32).default('all'), page: z.coerce.number().int().min(1).max(10000).default(1)});
export type AdminFilter = z.infer<typeof adminFilterSchema>;
const size = 25;
const pageRange = (page: number) => [(page - 1) * size, page * size - 1] as const;
function check(error: {message: string} | null) { if (error) throw new Error('Could not load admin data'); }

export async function adminUsers(raw: unknown) {
  await requireAdmin();
  const filter = adminFilterSchema.parse(raw);
  let query = createAdminClient().from('profiles').select('id,email,display_name,role,locale,trial_started_at,trial_ends_at,suspended,plan_override,created_at', {count: 'exact'});
  if (filter.q) {const q = filter.q.replace(/[^\p{L}\p{N}\s@._+-]/gu, ''); query = query.or(`email.ilike.%${q}%,display_name.ilike.%${q}%`);}
  if (filter.status === 'suspended') query = query.eq('suspended', true);
  else if (filter.status === 'trial') query = query.gt('trial_ends_at', new Date().toISOString()).is('plan_override', null);
  else if (filter.status === 'admin') query = query.eq('role', 'admin');
  const {data, count, error} = await query.order('created_at', {ascending: false}).range(...pageRange(filter.page));
  check(error);
  return {rows: data ?? [], count: count ?? 0, filter};
}

export async function adminUser(id: string) {
  await requireAdmin();
  const db = createAdminClient();
  const [profile, authUser, subscription, sites] = await Promise.all([
    db.from('profiles').select('*').eq('id', id).maybeSingle(),
    db.auth.admin.getUserById(id),
    db.from('subscriptions').select('*').eq('owner_id', id).maybeSingle(),
    db.from('sites').select('id,name,domain,status,verified_at,last_score,created_at').eq('owner_id', id).order('created_at', {ascending: false}).limit(100)
  ]);
  [profile,authUser,subscription,sites].forEach((r) => check(r.error));
  const siteIds = (sites.data ?? []).map((site) => site.id);
  const scans = siteIds.length ? await db.from('scans').select('id,site_id,status,kind,score,created_at,failure_code').in('site_id', siteIds).order('created_at', {ascending: false}).limit(20)
    : {data: [], error: null};
  check(scans.error);
  return {profile: profile.data, emailConfirmedAt: authUser.data.user?.email_confirmed_at ?? null,
    subscription: subscription.data, sites: sites.data ?? [], scans: scans.data ?? []};
}

export async function adminBilling(raw: unknown) {
  await requireAdmin();
  const f = adminFilterSchema.extend({eventPage: z.coerce.number().int().min(1).max(10000).default(1)}).parse(raw);
  const db = createAdminClient();
  let subscriptions = db.from('subscriptions').select('id,owner_id,plan_id,status,billing_period,paddle_subscription_id,paddle_customer_id,billing_country,current_period_end,cancel_at_period_end,created_at', {count: 'exact'});
  if (f.status !== 'all' && ['active','trialing','past_due','paused','canceled'].includes(f.status)) subscriptions = subscriptions.eq('status', f.status as Tables<'subscriptions'>['status']);
  if (f.q) {const q = f.q.replace(/[^a-zA-Z0-9_-]/g, ''); subscriptions = subscriptions.or(`paddle_subscription_id.ilike.%${q}%,paddle_customer_id.ilike.%${q}%`);}
  const [subs, events] = await Promise.all([
    subscriptions.order('created_at', {ascending: false}).range(...pageRange(f.page)),
    db.from('billing_events').select('id,event_type,provider_event_id,owner_id,processing_error,processed_at,created_at,payload', {count: 'exact'}).order('created_at', {ascending: false}).range(...pageRange(f.eventPage))
  ]);
  check(subs.error); check(events.error);
  return {subscriptions: subs.data ?? [], count: subs.count ?? 0, events: events.data ?? [], eventCount: events.count ?? 0, filter: f};
}

export async function adminSites(raw: unknown) {
  await requireAdmin();
  const f = adminFilterSchema.parse(raw);
  let query = createAdminClient().from('sites').select('id,owner_id,name,domain,status,verified_at,last_score,next_scan_at,created_at', {count: 'exact'});
  if (f.q) {const q = f.q.replace(/[^\p{L}\p{N}\s._-]/gu, ''); query = query.or(`name.ilike.%${q}%,domain.ilike.%${q}%`);}
  if (f.status === 'active' || f.status === 'paused') query = query.eq('status', f.status);
  const {data,count,error} = await query.order('created_at', {ascending: false}).range(...pageRange(f.page));
  check(error);
  return {rows: data ?? [], count: count ?? 0, filter: f};
}

export async function adminScans(raw: unknown) {
  await requireAdmin();
  const f = adminFilterSchema.extend({jobPage: z.coerce.number().int().min(1).max(10000).default(1), jobStatus: z.enum(['all','queued','running','succeeded','failed','dead','canceled']).default('all')}).parse(raw);
  const db = createAdminClient();
  let scans = db.from('scans').select('id,site_id,status,kind,score,failure_code,created_at,started_at,completed_at', {count: 'exact'});
  if (f.status !== 'all' && ['queued','running','completed','failed','canceled'].includes(f.status)) scans = scans.eq('status', f.status as Tables<'scans'>['status']);
  if (f.q && z.string().uuid().safeParse(f.q).success) scans = scans.or(`id.eq.${f.q},site_id.eq.${f.q}`);
  let jobQuery = db.from('scan_jobs').select('id,scan_id,module_key,step_key,status,attempts,max_attempts,last_error_code,available_at,locked_at,lease_expires_at,created_at', {count: 'exact'});
  if (f.jobStatus !== 'all') jobQuery = jobQuery.eq('status', f.jobStatus);
  const [result,jobs] = await Promise.all([
    scans.order('created_at', {ascending: false}).range(...pageRange(f.page)),
    jobQuery.order('created_at', {ascending: false}).range(...pageRange(f.jobPage))
  ]);
  check(result.error); check(jobs.error);
  return {rows: result.data ?? [], count: result.count ?? 0, jobs: jobs.data ?? [], jobCount: jobs.count ?? 0, filter: f};
}

export async function adminScan(id: string) {
  await requireAdmin();
  const scanId = z.string().uuid().parse(id);
  const db = createAdminClient();
  const {data: scan,error} = await db.from('scans').select('*').eq('id', scanId).maybeSingle();
  check(error);
  if (!scan) return null;
  const [site,jobs,modules] = await Promise.all([
    db.from('sites').select('id,name,domain,owner_id,status,verified_at').eq('id', scan.site_id).maybeSingle(),
    db.from('scan_jobs').select('id,scan_id,module_key,step_key,status,attempts,max_attempts,priority,available_at,locked_at,locked_by,lease_expires_at,last_error_code,completed_at,created_at').eq('scan_id', scan.id).order('created_at'),
    db.from('scan_modules_results').select('id,module_key,status,error_code,started_at,completed_at').eq('scan_id', scan.id).order('module_key')
  ]);
  [site,jobs,modules].forEach((r) => check(r.error));
  return {scan, site: site.data, jobs: jobs.data ?? [], modules: modules.data ?? []};
}

export async function adminInbox(raw: unknown) {
  await requireAdmin();
  const f = adminFilterSchema.parse(raw);
  const db = createAdminClient();
  const [blocked,abuse,contact] = await Promise.all([
    db.from('blocked_domains').select('*', {count: 'exact'}).order('created_at', {ascending: false}).range(...pageRange(f.page)),
    db.from('abuse_reports').select('*', {count: 'exact'}).order('created_at', {ascending: false}).range(...pageRange(f.page)),
    db.from('contact_messages').select('*', {count: 'exact'}).order('created_at', {ascending: false}).range(...pageRange(f.page))
  ]);
  [blocked,abuse,contact].forEach((r) => check(r.error));
  return {blocked: blocked.data ?? [], abuse: abuse.data ?? [], contact: contact.data ?? [], count: Math.max(blocked.count ?? 0, abuse.count ?? 0, contact.count ?? 0), filter: f};
}

export async function adminContent(raw: unknown) {
  await requireAdmin();
  const f = adminFilterSchema.parse(raw);
  const db = createAdminClient();
  const [announcements,changelog] = await Promise.all([
    db.from('announcements').select('*', {count: 'exact'}).order('created_at', {ascending: false}).range(...pageRange(f.page)),
    db.from('changelog_entries').select('*', {count: 'exact'}).order('created_at', {ascending: false}).range(...pageRange(f.page))
  ]);
  check(announcements.error); check(changelog.error);
  return {announcements: announcements.data ?? [], changelog: changelog.data ?? [], count: Math.max(announcements.count ?? 0, changelog.count ?? 0), filter: f};
}

export async function adminSystem(raw: unknown) {
  await requireAdmin();
  const f = adminFilterSchema.parse(raw);
  const db = createAdminClient();
  const [flags,settings,audit] = await Promise.all([
    db.from('feature_flags').select('*').order('key'),
    db.from('app_settings').select('*').order('key'),
    db.from('admin_audit_log').select('id,actor_id,action,target_table,target_id,details,ip_address,created_at', {count: 'exact'}).order('created_at', {ascending: false}).range(...pageRange(f.page))
  ]);
  [flags,settings,audit].forEach((r) => check(r.error));
  return {flags: flags.data ?? [], settings: settings.data ?? [], audit: audit.data ?? [], auditCount: audit.count ?? 0, filter: f};
}
