import type {SafeResponse} from '@/lib/ssrf';

export function header(response: SafeResponse, name: string): string {
  const value = response.headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(', ') : value ?? '';
}

export function htmlBody(response: SafeResponse): string {
  return /(?:text\/html|application\/xhtml\+xml)/i.test(header(response, 'content-type')) ? response.body.toString('utf8').slice(0, 300_000) : '';
}

export function scriptAssets(html: string, base: string, limit = 12): {url: string; integrity: boolean; thirdParty: boolean}[] {
  const result: {url: string; integrity: boolean; thirdParty: boolean}[] = [];
  const baseUrl = new URL(base);
  for (const match of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    try {
      const url = new URL(match[1], baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      result.push({url: url.toString(), integrity: /\bintegrity\s*=\s*["'][^"']+["']/i.test(match[0]), thirdParty: url.hostname !== baseUrl.hostname});
      if (result.length >= limit) break;
    } catch { /* Ignore invalid markup. */ }
  }
  return result;
}

export function likelySensitiveJson(response: SafeResponse): boolean {
  if (response.status !== 200 || !/json/i.test(header(response, 'content-type'))) return false;
  const text = response.body.toString('utf8').slice(0, 64_000);
  try {
    const value: unknown = JSON.parse(text);
    const keys = new Set<string>();
    const collect = (item: unknown, depth: number) => {
      if (depth > 2 || !item || typeof item !== 'object') return;
      if (Array.isArray(item)) { for (const child of item.slice(0, 2)) collect(child, depth + 1); return; }
      for (const [key, child] of Object.entries(item).slice(0, 30)) { keys.add(key.toLowerCase()); collect(child, depth + 1); }
    };
    collect(value, 0);
    return [...keys].some((key) => /^(?:email|password|token|secret|api_key|access_token|users|user_id|payment|customer_id|private_key)$/.test(key));
  } catch { return false; }
}

export function jwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length > 8192)) return null;
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object') return null;
    const role = (payload as Record<string, unknown>).role;
    return typeof role === 'string' ? role : null;
  } catch { return null; }
}
