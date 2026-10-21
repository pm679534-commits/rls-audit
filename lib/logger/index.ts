import 'server-only';

type Level = 'debug' | 'info' | 'warn' | 'error';
const levels: Level[] = ['debug', 'info', 'warn', 'error'];
const sensitiveKey = /secret|token|key|password|credential|authorization|cookie|ciphertext|payload|body|evidence|email|url|address/i;

function redact(value: unknown, depth = 0, key = ''): unknown {
  if (depth > 3) return '[redacted]';
  if (value instanceof Error) return {name: value.name};
  if (typeof value === 'string') {
    if (key === 'code' && /^[A-Z][A-Z0-9_]{1,39}$/.test(value)) return value;
    if (key === 'status' && /^(?:queued|running|completed|failed|canceled|succeeded|dead)$/.test(value)) return value;
    return '[redacted]';
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 30).map(([childKey, item]) => [childKey, sensitiveKey.test(childKey) ? '[redacted]' : redact(item, depth + 1, childKey)]));
  return '[redacted]';
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
