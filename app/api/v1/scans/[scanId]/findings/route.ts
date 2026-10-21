import {z} from 'zod';
import {apiEndpoint, json, ownedScan} from '@/lib/api/v1';
import {createAdminClient} from '@/lib/supabase/admin';
import {sanitizeEvidence} from '@/lib/scanner/evidence';
import {generateFindingFix} from '@/lib/scanner/fixes';
import {FINDING_REGISTRY, type FindingId} from '@/lib/scanner/registry';
import {hasEntitlement} from '@/lib/billing/entitlements';
import type {FindingEvidence} from '@/lib/scanner/types';

export const runtime = 'nodejs';
const querySchema = z.object({limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional()});
export async function GET(request: Request, {params}: {params: Promise<{scanId: string}>}) {
  return apiEndpoint(request, 'scans:read', 'findings:list', async (context, headers) => {
    const {scan, site} = await ownedScan(context, (await params).scanId);
    const {limit, offset, severity} = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const db = createAdminClient();
    let query = db.from('findings').select('*')
      .eq('scan_id', scan.id).order('severity').order('id').range(offset, offset + limit - 1);
    if (severity) query = query.eq('severity', severity);
    const {data, error} = await query;
    if (error) throw error;
    const fingerprints = (data ?? []).map((finding) => finding.fingerprint);
    const {data: states, error: stateError} = fingerprints.length ? await db.from('finding_states').select('fingerprint,status,reason')
      .eq('site_id', site.id).in('fingerprint', fingerprints) : {data: [], error: null};
    if (stateError) throw stateError;
    const byFingerprint = new Map((states ?? []).map((state) => [state.fingerprint, state]));
    const findings = (data ?? []).map((finding) => {
      const evidence = finding.evidence && typeof finding.evidence === 'object' && !Array.isArray(finding.evidence)
        ? sanitizeEvidence(finding.evidence as FindingEvidence) : {};
      const key = finding.finding_key as FindingId;
      const definition = FINDING_REGISTRY[key];
      const snippets = definition && context.entitlements.effective_plan && hasEntitlement(context.entitlements, 'generatedFixes')
        ? generateFindingFix({id: key, fingerprint: finding.fingerprint, affectedAsset: finding.affected_asset, evidence}, context.entitlements.effective_plan).snippets : [];
      return {id: finding.id, key, severity: finding.severity, affectedAsset: finding.affected_asset, evidence,
        titleKey: finding.title_key, descriptionKey: finding.description_key, impactKey: finding.impact_key, fixKey: finding.fix_key,
        state: byFingerprint.get(finding.fingerprint)?.status ?? 'open', reason: byFingerprint.get(finding.fingerprint)?.reason ?? null,
        references: definition?.references ?? [], snippets, firstSeenAt: finding.first_seen_at};
    });
    return json({data: findings, pagination: {limit, offset}}, headers);
  });
}
