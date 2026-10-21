import 'server-only';

import {headers} from 'next/headers';
import {z, type ZodTypeAny} from 'zod';
import {getPublicEnv} from '@/lib/env';
import {ForbiddenError, toActionError} from '@/lib/errors';
import {getSession, requireAdmin, requireUser, type UserContext} from '@/lib/auth';
import {checkActionRateLimit, trustedClientIp} from '@/lib/rate-limit';
import {logger} from '@/lib/logger';
import type {Locale} from '@/i18n/routing';

type Access = 'public' | 'user' | 'admin';
type ActionOptions = {access?: Access; locale?: Locale; rateLimit?: {name: string; limit: number; windowSeconds: number}};
export type ActionResult<T> = {ok: true; data: T} | ReturnType<typeof toActionError>;

async function requireSameOrigin(): Promise<void> {
  const incoming = await headers();
  const origin = incoming.get('origin');
  if (!origin) throw new ForbiddenError();
  const expected = new URL(getPublicEnv().NEXT_PUBLIC_SITE_URL).origin;
  if (origin !== expected) throw new ForbiddenError();
}

export function createServerAction<Schema extends ZodTypeAny, Output>(
  schema: Schema,
  handler: (input: z.output<Schema>, context: UserContext | null) => Promise<Output>,
  options: ActionOptions = {}
): (raw: unknown) => Promise<ActionResult<Output>> {
  return async (raw) => {
    let locale = options.locale ?? 'en';
    try {
      await requireSameOrigin();
      const referer = (await headers()).get('referer');
      const page = referer ? new URL(referer) : null;
      const routeLocale = page?.origin === new URL(getPublicEnv().NEXT_PUBLIC_SITE_URL).origin && /^\/(en|az)(?:\/|$)/.exec(page.pathname)?.[1];
      if (routeLocale === 'en' || routeLocale === 'az') locale = routeLocale;
      const context = options.access === 'admin' ? await requireAdmin() : options.access === 'public' ? await getSession() : await requireUser();
      if (context && !routeLocale) locale = context.profile.locale;
      const input = schema.parse(raw);
      if (options.rateLimit) {
        const identity = context?.user.id ?? trustedClientIp(await headers());
        await checkActionRateLimit(identity, options.rateLimit.name, options.rateLimit.limit, options.rateLimit.windowSeconds);
      }
      return {ok: true, data: await handler(input, context)};
    } catch (error) {
      const mapped = toActionError(error, locale);
      logger.error('server_action_failed', {code: mapped.error.code});
      return mapped;
    }
  };
}
