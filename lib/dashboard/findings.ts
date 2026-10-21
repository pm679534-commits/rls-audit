import 'server-only';

import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {requireSiteAccess, requireUser} from '@/lib/auth';
import {ForbiddenError, NotFoundError} from '@/lib/errors';
import {sanitizeEvidence} from '@/lib/scanner/evidence';
import {generateFindingFix} from '@/lib/scanner/fixes';
import {FINDING_REGISTRY, type FindingId} from '@/lib/scanner/registry';
import {resolveOwnerEntitlements, hasEntitlement} from '@/lib/billing/entitlements';
import type {FindingEvidence} from '@/lib/scanner/types';
import type {Tables} from '@/types/database';

export type FindingView = Tables<'findings'> & {state: Tables<'finding_states'>['status']; reason: string | null; snippets: {language: 'sql' | 'typescript'; code: string}[]; references: readonly string[]};

export async function getFindingViews(siteId: string, scanId: string): Promise<FindingView[]> {
  const site = await requireSiteAccess(siteId);
  const db = await createClient();
  const [findings, states] = await Promise.all([
    (async () => {
      const rows: Tables<'findings'>[] = [];
      for (let offset = 0; ; offset += 500) {
        const {data, error} = await db.from('findings').select('*').eq('site_id', site.id).eq('scan_id', scanId)
          .order('score_weight', {ascending: false}).order('id').range(offset, offset + 499);
        if (error) throw new Error('Could not load findings');
        rows.push(...(data ?? []));
        if (!data || data.length < 500) return rows;
      }
    })(),
    (async () => {
      const rows: Tables<'finding_states'>[] = [];
      for (let offset = 0; ; offset += 500) {
        const {data, error} = await db.from('finding_states').select('*').eq('site_id', site.id).order('id').range(offset, offset + 499);
        if (error) throw new Error('Could not load finding states');
        rows.push(...(data ?? []));
        if (!data || data.length < 500) return rows;
      }
    })()
  ]);
  const stateMap = new Map(states.map((row) => [row.fingerprint, row]));
  const owner = await resolveOwnerEntitlements(site.owner_id);
  const canGenerate = hasEntitlement(owner, 'generatedFixes');
  return findings.map((row) => {
    const state = stateMap.get(row.fingerprint);
    const evidence = row.evidence && typeof row.evidence === 'object' && !Array.isArray(row.evidence) ? sanitizeEvidence(row.evidence as FindingEvidence) : {};
    const snippets = canGenerate && owner.effective_plan && row.finding_key in FINDING_REGISTRY
      ? generateFindingFix({id: row.finding_key as FindingId, fingerprint: row.fingerprint, affectedAsset: row.affected_asset, evidence}, owner.effective_plan).snippets : [];
    return {...row, evidence, state: state?.status ?? 'open', reason: state?.reason ?? null, snippets,
      references: row.finding_key in FINDING_REGISTRY ? FINDING_REGISTRY[row.finding_key as FindingId].references : []};
  });
}

export async function changeFindingState(input: {siteId: string; findingId: string; status: Tables<'finding_states'>['status']; reason?: string}): Promise<void> {
  const site = await requireSiteAccess(input.siteId, 'edit');
  const context = await requireUser();
  const {data: finding, error} = await createAdminClient().from('findings').select('fingerprint').eq('id', input.findingId).eq('site_id', site.id).maybeSingle();
  if (error || !finding) throw new NotFoundError();
  if (['ignored', 'accepted'].includes(input.status) && !input.reason?.trim()) throw new ForbiddenError();
  const {error: writeError} = await createAdminClient().from('finding_states').upsert({site_id: site.id, fingerprint: finding.fingerprint,
    status: input.status, reason: ['ignored', 'accepted'].includes(input.status) ? input.reason!.trim() : null,
    changed_by: context.user.id, resolved_at: input.status === 'fixed' ? new Date().toISOString() : null}, {onConflict: 'site_id,fingerprint'});
  if (writeError) throw new Error('Could not update finding');
}
