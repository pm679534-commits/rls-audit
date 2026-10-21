import {createAdminClient} from '@/lib/supabase/admin';
import {verifyUnsubscribeToken} from '@/lib/notifications/unsubscribe';
import {toRouteError} from '@/lib/errors';
import en from '@/messages/en.json';
import az from '@/messages/az.json';

export const runtime = 'nodejs';
function page(request: Request, token: string, done: boolean): Response {
  const isAz = new URL(request.url).searchParams.get('lang') === 'az';
  const copy = (isAz ? az : en).Phase9.unsubscribe;
  const action = `/api/unsubscribe/${token}?lang=${isAz ? 'az' : 'en'}`;
  const title = done ? copy.title : copy.confirmTitle;
  const heading = done ? copy.heading : copy.confirmTitle;
  const body = done ? copy.body : copy.confirmBody;
  return new Response(`<!doctype html><html lang="${isAz ? 'az' : 'en'}"><meta charset="utf-8"><meta name="robots" content="noindex"><title>${title}</title><body style="font:16px Arial,sans-serif;max-width:600px;margin:12vh auto;padding:24px"><h1>${heading}</h1><p>${body}</p>${done ? '' : `<form method="post" action="${action}"><button style="background:#117d78;color:white;border:0;border-radius:8px;padding:12px 20px;cursor:pointer">${copy.confirmAction}</button></form>`}</body></html>`,
    {headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'"}});
}
async function unsubscribe(token: string) {
  const userId = verifyUnsubscribeToken(token);
  const db = createAdminClient();
  const {data: profile} = await db.from('profiles').select('notification_preferences').eq('id', userId).maybeSingle();
  if (!profile) return new Response(null, {status: 204});
  const preferences = profile.notification_preferences && typeof profile.notification_preferences === 'object' && !Array.isArray(profile.notification_preferences) ? profile.notification_preferences : {};
  const {error} = await db.from('profiles').update({email_unsubscribed_at: new Date().toISOString(), notification_preferences: {...preferences, email: false}}).eq('id', userId);
  if (error) throw error;
  return new Response(null, {status: 204, headers: {'Cache-Control': 'no-store'}});
}
export async function POST(request: Request, {params}: {params: Promise<{token: string}>}) {
  try {
    const token = (await params).token;
    await unsubscribe(token);
    return request.headers.get('accept')?.includes('text/html') ? page(request, token, true) : new Response(null, {status: 204});
  } catch (error) { return toRouteError(error); }
}
export async function GET(request: Request, {params}: {params: Promise<{token: string}>}) {
  try {
    const token = (await params).token;
    verifyUnsubscribeToken(token);
    return page(request, token, false);
  }
  catch (error) { return toRouteError(error); }
}
