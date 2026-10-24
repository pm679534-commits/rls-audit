import 'server-only';

import {randomUUID} from 'node:crypto';

type Level = 'debug' | 'info' | 'warn' | 'error';
const levels: Level[] = ['debug', 'info', 'warn', 'error'];
const sensitiveKey = /secret|token|key|password|credential|authorization|cookie|ciphertext|payload|body|evidence|email|url|address/i;

function redact(value: unknown, depth = 0, key = ''): unknown {
  if (depth > 3) return '[redacted]';
  if (value instanceof Error) return {name: value.name};
  if (typeof value === 'string') {
    if (['siteId', 'scanId', 'challengeId', 'requesterId'].includes(key) && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) return value;
    if (key === 'method' && /^(?:dns_txt|meta_tag|well_known_file)$/.test(value)) return value;
    if (key === 'kind' && /^(?:manual|passive|automatic|api)$/.test(value)) return value;
    if (key === 'reasonCode' && /^[a-z][a-z0-9_]{1,39}$/.test(value)) return value;
    if (key === 'code' && /^[A-Z][A-Z0-9_]{1,39}$/.test(value)) return value;
    if (key === 'status' && /^(?:queued|running|completed|failed|canceled|succeeded|dead)$/.test(value)) return value;
    return '[redacted]';
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 30).map(([childKey, item]) => [childKey, sensitiveKey.test(childKey) ? '[redacted]' : redact(item, depth + 1, childKey)]));
  return '[redacted]';
}

function diagnostic(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let safe = value.slice(0, 12_000)
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s'"<>`]+/gi, '[url]')
    .replace(/\b(?:authorization|apikey|api_key|token|secret|password|credential)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\b(?:eyJ[A-Za-z0-9_-]{20,}|[A-Za-z0-9+/_=-]{32,})\b/g, '[redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]');
  for (const [key, secret] of Object.entries(process.env)) {
    if (secret && secret.length >= 8 && /SECRET|TOKEN|KEY|PASSWORD|CREDENTIAL|DATABASE_URL/i.test(key)) {
      safe = safe.replaceAll(secret, '[redacted]');
    }
  }
  return safe;
}

export function logUnexpectedError(event: string, error: unknown, context: Record<string, unknown> = {}): string {
  const requestId = randomUUID();
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error',
    event: event.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80),
    requestId, context: redact(context),
    error: error instanceof Error
      ? {name: diagnostic(error.name), message: diagnostic(error.message), stack: diagnostic(error.stack)}
      : {name: 'NonErrorThrown', message: diagnostic(String(error))}
  });
  console.error(entry);
  return requestId;
}

export function log(level: Level, event: string, context: Record<string, unknown> = {}): void {
  const configured = process.env.LOG_LEVEL as Level | undefined;
  if (levels.indexOf(level) < levels.indexOf(configured && levels.includes(configured) ? configured : 'info')) return;
  const entry = JSON.stringify({timestamp: new Date().toISOString(), level, event: event.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80), context: redact(context)});
  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.info(entry);
}

export const logger = {
  debug: (event: string, context?: Record<string, unknown>) => log('debug', event, context),
  info: (event: string, context?: Record<string, unknown>) => log('info', event, context),
  warn: (event: string, context?: Record<string, unknown>) => log('warn', event, context),
  error: (event: string, context?: Record<string, unknown>) => log('error', event, context)
};
