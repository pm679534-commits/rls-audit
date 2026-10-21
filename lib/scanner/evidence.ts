import 'server-only';

import {createHash} from 'node:crypto';
import type {Json} from '@/types/database';
import type {Finding, FindingEvidence} from './types';

const allowedKeys = new Set(['header', 'status', 'path', 'table', 'columns', 'estimatedRows', 'bucket', 'function', 'version', 'advisory', 'daysRemaining', 'module', 'method', 'reasonCode', 'source', 'provider', 'count', 'manualVerification', 'detected']);
const secretLike = /(?:eyJ[A-Za-z0-9_-]{20,}\.)|(?:sb_secret_[A-Za-z0-9_-]{12,})|(?:sk_[A-Za-z0-9_-]{12,})|(?:bearer\s+\S+)|(?:postgres(?:ql)?:\/\/)/i;

function safeScalar(value: unknown): Json | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(-1_000_000, Math.min(1_000_000, value)) : undefined;
  if (typeof value !== 'string' || value.length > 160 || secretLike.test(value) || /[\r\n<>@?&#]/.test(value)) return undefined;
  return value;
}

export function sanitizeEvidence(input: FindingEvidence): FindingEvidence {
  const out: FindingEvidence = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowedKeys.has(key) || value === undefined) continue;
    if (Array.isArray(value)) {
      out[key] = value.slice(0, 30).map(safeScalar).filter((item): item is Json => item !== undefined);
      continue;
    }
    const safe = safeScalar(value);
    if (safe !== undefined) out[key] = safe;
  }
  return out;
}

export function safeAsset(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const parsed = new URL(input);
    return `${parsed.origin}${parsed.pathname}`.slice(0, 300);
  } catch {
    return /^[a-zA-Z0-9_.:/-]{1,300}$/.test(input) ? input : null;
  }
}

export function makeFinding(id: string, asset: string | null, evidence: FindingEvidence = {}, metadata: FindingEvidence = {}): Finding {
  const affectedAsset = safeAsset(asset);
  const discriminator = [evidence.table, evidence.bucket, evidence.function, evidence.advisory, evidence.path, evidence.method].filter((item): item is string => typeof item === 'string').join(':');
  const fingerprint = createHash('sha256').update(`${id}\0${affectedAsset ?? ''}\0${discriminator}`).digest('hex');
  return {id, fingerprint, affectedAsset, evidence: sanitizeEvidence(evidence), metadata: sanitizeEvidence(metadata)};
}
