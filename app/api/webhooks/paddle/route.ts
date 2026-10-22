import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getServerEnv} from '@/lib/env';
import {paddleClient} from '@/lib/billing/paddle';
import {billingProvider} from '@/lib/billing/paddle';
import {syncSubscription, notifyPaymentFailed} from '@/lib/billing/sync';
import {createAdminClient} from '@/lib/supabase/admin';
import {logger, logUnexpectedError} from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 30;

type EventData = {id?: string; subscriptionId?: string | null; customerId?: string | null; customData?: {ownerId?: unknown} | null};
const supported = new Set(['subscription.created', 'subscription.updated', 'subscription.canceled', 'subscription.past_due', 'subscription.paused', 'subscription.resumed', 'transaction.completed', 'transaction.payment_failed', 'transaction.past_due']);
const eventSchema = z.object({eventId: z.string().min(1).max(128), eventType: z.string().min(1).max(128),
  data: z.object({id: z.string().optional(), subscriptionId: z.string().nullable().optional(),
    customerId: z.string().nullable().optional(), customData: z.object({ownerId: z.string().uuid().optional()}).nullable().optional()}).passthrough()});

async function readWebhookBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_000_000) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  } catch { return null; } finally { reader.releaseLock(); }
}

async function handleWebhook(request: Request) {
  const signature = request.headers.get('paddle-signature');
  if (!signature || Number(request.headers.get('content-length') ?? 0) > 1_000_000) return new Response(null, {status: 400});
  const body = await readWebhookBody(request);
  if (body === null) return new Response(null, {status: 400});
  let event;
  try { event = await paddleClient().webhooks.unmarshal(body, getServerEnv().PADDLE_WEBHOOK_SECRET, signature); }
  catch { return new Response(null, {status: 400}); }
  if (!eventSchema.safeParse(event).success) return new Response(null, {status: 400});
  const db = createAdminClient();
  const now = new Date().toISOString();
  const data = event.data as EventData;
  const eventKey = `paddle:${event.eventId}`;
  const {error: insertError} = await db.from('billing_events').insert({idempotency_key: eventKey, provider_event_id: event.eventId,
    event_type: event.eventType, payload: {resourceId: data.id ?? null}, processing_started_at: now});
  if (insertError) {
    if (insertError.code !== '23505') { logger.error('billing_event_insert_failed', {code: insertError.code}); return new Response(null, {status: 503}); }
    const {data: prior} = await db.from('billing_events').select('processed_at,processing_started_at').eq('provider_event_id', event.eventId).maybeSingle();
    if (prior?.processed_at) return NextResponse.json({ok: true});
    if (prior?.processing_started_at && Date.now() - new Date(prior.processing_started_at).getTime() < 120_000) return new Response(null, {status: 503});
    let claim = db.from('billing_events').update({processing_started_at: now}).eq('provider_event_id', event.eventId).is('processed_at', null);
    claim = prior?.processing_started_at ? claim.eq('processing_started_at', prior.processing_started_at) : claim.is('processing_started_at', null);
    const {data: claimed} = await claim.select('id').maybeSingle();
    if (!claimed) return new Response(null, {status: 503});
  }
  try {
    if (supported.has(event.eventType)) {
      const subscriptionId = event.eventType.startsWith('subscription.') ? data.id : data.subscriptionId;
      const hintedOwner = typeof data.customData?.ownerId === 'string' ? data.customData.ownerId : null;
      let deletedOwner = false;
      let remote = null;
      if (subscriptionId) {
        try { remote = await syncSubscription(subscriptionId, hintedOwner); }
        catch (syncError) {
          // A cancellation webhook can arrive after an administrator has deleted the account.
          const subscription = await billingProvider.getSubscription(subscriptionId);
          const formerOwner = subscription.ownerId ?? hintedOwner;
          if (subscription.status !== 'canceled' || !formerOwner) throw syncError;
          const {data: profile, error: profileError} = await db.from('profiles').select('id').eq('id', formerOwner).maybeSingle();
          if (profileError || profile) throw syncError;
          deletedOwner = true;
        }
      }
      const {data: local} = remote ? await db.from('subscriptions').select('owner_id').eq('paddle_subscription_id', remote.id).single() : {data: null};
      const {data: customerSubscription} = !local && data.customerId
        ? await db.from('subscriptions').select('owner_id').eq('paddle_customer_id', data.customerId).maybeSingle()
        : {data: null};
      const ownerId = deletedOwner ? null : local?.owner_id ?? customerSubscription?.owner_id ?? hintedOwner;
      if (event.eventType === 'transaction.payment_failed' || event.eventType === 'transaction.past_due') {
        if (!ownerId) throw new Error('billing_owner_missing');
        await notifyPaymentFailed(ownerId, event.eventId);
      }
      const {error} = await db.from('billing_events').update({owner_id: ownerId, processed_at: new Date().toISOString(), processing_error: null})
        .eq('provider_event_id', event.eventId);
      if (error) throw error;
    } else {
      await db.from('billing_events').update({processed_at: new Date().toISOString()}).eq('provider_event_id', event.eventId);
    }
    return NextResponse.json({ok: true});
  } catch (error) {
    const requestId = logUnexpectedError('billing_webhook_failed', error, {eventType: event.eventType});
    await db.from('billing_events').update({processing_error: 'processing_failed', processing_started_at: null}).eq('provider_event_id', event.eventId);
    return new Response(null, {status: 503, headers: {'X-Request-ID': requestId}});
  }
}

export async function POST(request: Request) {
  try { return await handleWebhook(request); }
  catch (error) {
    const requestId = logUnexpectedError('billing_webhook_unhandled', error);
    return new Response(null, {status: 503, headers: {'X-Request-ID': requestId}});
  }
}
