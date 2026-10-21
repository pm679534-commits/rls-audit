import 'server-only';

import {z} from 'zod';
import {publicSchema} from '@/lib/public-env';
export {getPublicEnv} from '@/lib/public-env';
export type {PublicEnv} from '@/lib/public-env';

const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(32),
  ENCRYPTION_MASTER_KEY: z.string().refine((value) => {
    try { return /^[A-Za-z0-9+/]{43}=$/.test(value) && Buffer.from(value, 'base64').length === 32; } catch { return false; }
  }, 'Must be a base64 encoded 32-byte key'),
  ENCRYPTION_KEY_VERSION: z.coerce.number().int().positive(),
  ENCRYPTION_PREVIOUS_KEYS: z.string().optional(),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(3),
  PADDLE_API_KEY: z.string().min(1),
  PADDLE_WEBHOOK_SECRET: z.string().min(1),
  PADDLE_ENVIRONMENT: z.enum(['sandbox', 'production']),
  PADDLE_PRICE_STARTER_MONTHLY: z.string().min(1),
  PADDLE_PRICE_STARTER_ANNUAL: z.string().min(1),
  PADDLE_PRICE_PRO_MONTHLY: z.string().min(1),
  PADDLE_PRICE_PRO_ANNUAL: z.string().min(1),
  PADDLE_PRICE_AGENCY_MONTHLY: z.string().min(1),
  PADDLE_PRICE_AGENCY_ANNUAL: z.string().min(1),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  COMPANY_LEGAL_NAME: z.string().min(1),
  COMPANY_ADDRESS: z.string().min(1),
  COMPANY_EMAIL: z.string().email(),
  COMPANY_REGISTRATION_NUMBER: z.string().optional(),
  COMPANY_VAT_NUMBER: z.string().optional(),
  MAINTENANCE_MODE: z.enum(['true', 'false']).default('false'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info')
});

export type ServerEnv = z.infer<typeof serverSchema>;

function parseEnv<T extends z.ZodTypeAny>(schema: T, values: unknown, scope: string): z.infer<T> {
  const parsed = schema.safeParse(values);
  if (parsed.success) return parsed.data;
  const names = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
  throw new Error(`Invalid ${scope} environment variables: ${names}`);
}

let cachedServer: ServerEnv | undefined;
export function getServerEnv(): ServerEnv {
  return cachedServer ??= parseEnv(serverSchema, process.env, 'server');
}
