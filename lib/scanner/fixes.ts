import type {PlanId} from '@/lib/plans';
import {hasFeature} from '@/lib/plans';
import type {Finding} from './types';
import {FINDING_REGISTRY, type FindingId} from './registry';

export type FindingFix = {guideKey: string; snippets: {language: 'sql' | 'typescript'; code: string}[]};

function sqlIdentifier(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value) ? `"${value.replaceAll('"', '""')}"` : null;
}

function tablePolicy(finding: Finding): string | null {
  const table = sqlIdentifier(finding.evidence.table);
  const columns = Array.isArray(finding.evidence.columns) ? finding.evidence.columns : [];
  const owner = columns.includes('user_id') ? 'user_id' : columns.includes('owner_id') ? 'owner_id' : null;
  if (!table) return null;
  if (finding.id === 'cross_user_read') {
    if (!owner) return null;
    return `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;\nCREATE POLICY "siteguard_owner_select" ON public.${table}\n  AS RESTRICTIVE FOR SELECT TO authenticated\n  USING (${sqlIdentifier(owner)} = (SELECT auth.uid()));`;
  }
  return `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;\nREVOKE SELECT ON TABLE public.${table} FROM anon;${owner ? `\nCREATE POLICY "siteguard_owner_select" ON public.${table}\n  AS RESTRICTIVE FOR SELECT TO authenticated\n  USING (${sqlIdentifier(owner)} = (SELECT auth.uid()));` : ''}`;
}

const headers: Record<string, {name: string; value: string}> = {
  missing_hsts: {name: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains'},
  missing_frame_protection: {name: 'X-Frame-Options', value: 'DENY'},
  missing_content_type_options: {name: 'X-Content-Type-Options', value: 'nosniff'},
  weak_referrer_policy: {name: 'Referrer-Policy', value: 'strict-origin-when-cross-origin'},
  missing_permissions_policy: {name: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()'}
};

function headerCode(id: string): string | null {
  const item = headers[id];
  if (!item) return null;
  return `// next.config.ts\nconst nextConfig = {\n  async headers() {\n    return [{ source: '/(.*)', headers: [{ key: '${item.name}', value: '${item.value}' }] }];\n  }\n};\nexport default nextConfig;`;
}

export function generateFindingFix(finding: Finding, plan: PlanId): FindingFix {
  const definition = FINDING_REGISTRY[finding.id as FindingId];
  if (!definition) throw new Error('Unknown finding definition');
  const result: FindingFix = {guideKey: definition.fixKey, snippets: []};
  if (!hasFeature(plan, 'generatedFixes')) return result;
  const policy = ['anon_readable_table', 'anon_readable_sensitive_table', 'cross_user_read'].includes(finding.id) ? tablePolicy(finding) : null;
  if (policy) result.snippets.push({language: 'sql', code: policy});
  const snippet = headerCode(finding.id);
  if (snippet) result.snippets.push({language: 'typescript', code: snippet});
  if (finding.id === 'exposed_source_map') result.snippets.push({language: 'typescript', code: '// next.config.ts\nconst nextConfig = { productionBrowserSourceMaps: false };\nexport default nextConfig;'});
  if (finding.id === 'insecure_cookie' || finding.id === 'cookie_missing_httponly' || finding.id === 'cookie_missing_samesite') result.snippets.push({language: 'typescript', code: "import {cookies} from 'next/headers';\nconst store = await cookies();\nstore.set('session', sessionValue, {httpOnly: true, secure: true, sameSite: 'lax', path: '/'});"});
  if (finding.id === 'client_secret_leak' || finding.id === 'service_role_leak') result.snippets.push({language: 'typescript', code: "import 'server-only';\n// Access the secret only inside a server module. Rotate the exposed key immediately.\nconst key = process.env.SUPABASE_SERVICE_ROLE_KEY;"});
  return result;
}
