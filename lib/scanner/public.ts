import 'server-only';

import {z} from 'zod';
import {getSiteUrl} from '@/lib/config';
import {checkRouteRateLimit, clientIp} from '@/lib/rate-limit';
import {safeFetch, normalizeSiteUrl} from '@/lib/ssrf';
import {verifyTurnstile} from '@/lib/turnstile';
import {urlSchema} from '@/lib/validation';
import {requireSystemFeature, systemNumberSetting} from '@/lib/system/config';
import {createAdminClient} from '@/lib/supabase/admin';
import {BlockedDomainError} from '@/lib/errors';
import {FINDING_REGISTRY, type FindingId} from './registry';
import {calculateScore} from './scoring';
import {generalWebModule} from './modules/general-web';
import type {ScanContext} from './types';

const inputSchema = z.object({url: urlSchema, turnstileToken: z.string().max(4096).optional()});

export async function checkPublicSite(input: unknown, request: Request) {
  await requireSystemFeature('public_passive_check');
  const parsed = inputSchema.parse(input);
  const rate = await checkRouteRateLimit(request, 'public-passive-check', await systemNumberSetting('public_check_rate_per_hour', 10), 3600);
  await verifyTurnstile(parsed.turnstileToken, {ip: clientIp(request), action: 'passive_check', hostname: getSiteUrl().hostname});
  const normalized = normalizeSiteUrl(parsed.url);
  const {data: blocked, error: blockedError} = await createAdminClient().rpc('is_blocked_domain', {p_domain: normalized.hostname});
  if (blockedError) throw new Error('Could not check domain policy');
  if (blocked) throw new BlockedDomainError();
  const deadlineAt = Date.now() + 7000;
  const context: ScanContext = {
    site: {normalized_url: normalized.url, domain: normalized.domain},
    verified: false, state: {}, deadlineAt,
    http: (url, options = {}) => safeFetch(url, {...options, maxBytes: Math.min(options.maxBytes ?? 300_000, 300_000), timeoutMs: Math.max(100, Math.min(options.timeoutMs ?? 5000, deadlineAt - Date.now()))})
  };
  const result = await generalWebModule.steps[0].run(context);
  const score = calculateScore(result.findings);
  return {
    domain: normalized.domain,
    score,
    findings: result.findings.map((finding) => {
      const definition = FINDING_REGISTRY[finding.id as FindingId];
      return {id: finding.id, severity: definition.severity, titleKey: definition.titleKey, descriptionKey: definition.descriptionKey, impactKey: definition.impactKey, fixKey: definition.fixKey, evidence: finding.evidence};
    }),
    headers: rate.headers
  };
}
