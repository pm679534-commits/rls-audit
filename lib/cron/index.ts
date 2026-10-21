import 'server-only';

import {constantTimeEqual} from '@/lib/crypto';
import {getServerEnv} from '@/lib/env';
import {UnauthenticatedError, toRouteError} from '@/lib/errors';

export async function cronEndpoint(request: Request, run: () => Promise<unknown>): Promise<Response> {
  try {
    const value = request.headers.get('authorization') ?? '';
    if (!constantTimeEqual(value, `Bearer ${getServerEnv().CRON_SECRET}`)) throw new UnauthenticatedError();
    return Response.json({ok: true, result: await run()}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) { return toRouteError(error, {'Cache-Control': 'no-store'}); }
}
