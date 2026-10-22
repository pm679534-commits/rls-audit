import 'server-only';

import {z} from 'zod';
import {getOptionalTurnstileEnv} from '@/lib/env';
import {ValidationError, ExternalServiceError} from '@/lib/errors';

const responseSchema = z.object({success: z.boolean(), hostname: z.string().optional(), action: z.string().optional()});

export async function verifyTurnstile(token: string | undefined, options: {ip?: string; action?: string; hostname?: string} = {}): Promise<void> {
  const {siteKey, secretKey} = getOptionalTurnstileEnv();
  if (!siteKey || !secretKey) return;
  if (!token || token.length > 4096) throw new ValidationError();
  const body = new URLSearchParams({secret: secretKey, response: token});
  if (options.ip) body.set('remoteip', options.ip);
  let response: Response;
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body, headers: {'content-type': 'application/x-www-form-urlencoded'},
      signal: AbortSignal.timeout(5000), cache: 'no-store'
    });
  } catch { throw new ExternalServiceError(); }
  if (!response.ok) throw new ExternalServiceError();
  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success || !parsed.data.success ||
      (options.action && parsed.data.action !== options.action) ||
      (options.hostname && parsed.data.hostname !== options.hostname)) throw new ValidationError();
}
