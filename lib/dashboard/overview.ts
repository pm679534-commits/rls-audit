import 'server-only';

import {createClient} from '@/lib/supabase/server';
import {requireUser} from '@/lib/auth';
import {resolveEntitlements, resolveOwnerEntitlements} from '@/lib/billing/entitlements';
import type {Tables} from '@/types/database';

export async function getOverview() {
  const context = await requireUser();
  const db = await createClient();
  const [entitlements, {data: sites, error: siteError}, {data: notifications, error: noticeError}, {data: manualScans, error: countError}] = await Promise.all([
    resolveEntitlements(context),
    db.from('sites').select('*').order('created_at', {ascending: false}),
    db.from('notifications').select('id,type,title_key,created_at,site_id').eq('user_id', context.user.id).order('created_at', {ascending: false}).limit(5),
    db.rpc('manual_scan_count_this_month', {p_user: context.user.id})
  ]);
  if (siteError || noticeError || countError) throw new Error('Could not load overview');
  const siteIds = (sites ?? []).map((site) => site.id);
  const ownerPlans = new Map(await Promise.all([...new Set((sites ?? []).map((site) => site.owner_id))].map(async (ownerId) =>
    [ownerId, ownerId === context.user.id ? entitlements : await resolveOwnerEntitlements(ownerId)] as const)));
  const historyDays = new Map((sites ?? []).map((site) => [site.id, ownerPlans.get(site.owner_id)?.history_days ?? 30]));
  const oldestCutoff = new Date(Date.now() - Math.max(30, ...historyDays.values()) * 86_400_000).toISOString();
  const [scanResult, latestScans] = await Promise.all([
    siteIds.length
      ? db.from('scans').select('id,site_id,score,status,kind,created_at,completed_at').in('site_id', siteIds).gte('created_at', oldestCutoff).order('created_at', {ascending: false}).limit(250)
      : Promise.resolve({data: [], error: null}),
    Promise.all(siteIds.map(async (siteId) => db.from('scans').select('id').eq('site_id', siteId).eq('status', 'completed')
      .gte('created_at', new Date(Date.now() - (historyDays.get(siteId) ?? 30) * 86_400_000).toISOString()).order('created_at', {ascending: false}).limit(1).maybeSingle()))
  ]);
  const {data: scans, error: scansError} = scanResult;
  if (scansError) throw new Error('Could not load scans');
  const visibleScans = (scans ?? []).filter((scan) => new Date(scan.created_at).getTime() >= Date.now() - (historyDays.get(scan.site_id) ?? 30) * 86_400_000);
  if (latestScans.some((result) => result.error)) throw new Error('Could not load latest scans');
  const latestIds = latestScans.flatMap((result) => result.data ? [result.data.id] : []);
  const [findings, states, {data: team, error: teamError}] = await Promise.all([
    (async () => {
      const rows: Pick<Tables<'findings'>, 'site_id' | 'fingerprint' | 'severity'>[] = [];
      if (!latestIds.length) return rows;
      for (let offset = 0; ; offset += 500) {
        const {data, error} = await db.from('findings').select('site_id,fingerprint,severity').in('scan_id', latestIds).order('id').range(offset, offset + 499);
        if (error) throw new Error('Could not load findings');
        rows.push(...(data ?? []));
        if (!data || data.length < 500) return rows;
      }
    })(),
    (async () => {
      const rows: Pick<Tables<'finding_states'>, 'site_id' | 'fingerprint' | 'status'>[] = [];
      if (!siteIds.length) return rows;
      for (let offset = 0; ; offset += 500) {
        const {data, error} = await db.from('finding_states').select('site_id,fingerprint,status').in('site_id', siteIds).order('id').range(offset, offset + 499);
        if (error) throw new Error('Could not load finding states');
        rows.push(...(data ?? []));
        if (!data || data.length < 500) return rows;
      }
    })(),
    db.from('teams').select('id').eq('owner_id', context.user.id).maybeSingle()
  ]);
  if (teamError) throw new Error('Could not load overview details');
  const stateMap = new Map(states.map((state) => [`${state.site_id}:${state.fingerprint}`, state.status]));
  const severity = {critical: 0, high: 0, medium: 0, low: 0, info: 0};
  for (const finding of findings) if ((stateMap.get(`${finding.site_id}:${finding.fingerprint}`) ?? 'open') === 'open') severity[finding.severity]++;
  const {count: seats} = team ? await db.from('team_members').select('user_id', {count: 'exact', head: true}).eq('team_id', team.id) : {count: 0};
  const scoresByDay = new Map<string, number[]>();
  for (const scan of visibleScans) {
    if (scan.status !== 'completed' || scan.score === null) continue;
    const day = (scan.completed_at ?? scan.created_at).slice(0, 10);
    scoresByDay.set(day, [...(scoresByDay.get(day) ?? []), scan.score]);
  }
  const points = [...scoresByDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-30)
    .map(([date, scores]) => ({date, score: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)}));
  const nextScans = (sites ?? []).filter((site) => site.status === 'active' && site.next_scan_at).sort((a, b) => a.next_scan_at!.localeCompare(b.next_scan_at!)).slice(0, 5);
  const activity = [...visibleScans.slice(0, 8).map((scan) => ({id: scan.id, kind: 'scan' as const, at: scan.created_at, siteId: scan.site_id, status: scan.status})),
    ...(notifications ?? []).map((notice) => ({id: notice.id, kind: 'notification' as const, at: notice.created_at, siteId: notice.site_id, status: notice.type}))]
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  return {context, entitlements, sites: sites ?? [] as Tables<'sites'>[], scans: visibleScans, severity, points, nextScans, activity,
    usage: {sites: (sites ?? []).filter((site) => site.owner_id === context.user.id && site.status === 'active').length,
      manualScans: manualScans ?? 0, seats: seats ?? 0}};
}
