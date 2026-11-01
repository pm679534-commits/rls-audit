import 'server-only';

import {ApiError, type Paddle} from '@paddle/paddle-node-sdk';
import {ExternalServiceError} from '@/lib/errors';
import {logger} from '@/lib/logger';
import {createAdminClient} from '@/lib/supabase/admin';

type DbError = {code?: string; message?: string} | null;

function tableMissing(error: DbError): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

function ownershipConflict(): never {
  logger.error('billing_customer_ownership_conflict');
  throw new ExternalServiceError();
}

async function storedCustomer(userId: string): Promise<string | null> {
  const {data, error} = await createAdminClient().from('billing_customers')
    .select('paddle_customer_id').eq('user_id', userId).maybeSingle();
  if (tableMissing(error)) return null;
  if (error) throw new ExternalServiceError();
  return data?.paddle_customer_id ?? null;
}

async function subscriptionCustomer(userId: string): Promise<string | null> {
  const {data, error} = await createAdminClient().from('subscriptions')
    .select('paddle_customer_id').eq('owner_id', userId).maybeSingle();
  if (error) throw new ExternalServiceError();
  return data?.paddle_customer_id ?? null;
}

export async function ownerForPaddleCustomer(customerId: string): Promise<string | null> {
  const db = createAdminClient();
  const [{data: linked, error: linkError}, {data: subscriptions, error: subscriptionError}] = await Promise.all([
    db.from('billing_customers').select('user_id').eq('paddle_customer_id', customerId).maybeSingle(),
    db.from('subscriptions').select('owner_id').eq('paddle_customer_id', customerId).limit(2)
  ]);
  if (subscriptionError || (linkError && !tableMissing(linkError))) throw new ExternalServiceError();
  const owners = new Set([...(linked ? [linked.user_id] : []), ...(subscriptions ?? []).map((row) => row.owner_id)]);
  if (owners.size > 1) ownershipConflict();
  return owners.values().next().value ?? null;
}

export async function linkPaddleCustomer(userId: string, customerId: string): Promise<void> {
  const [existing, fromSubscription, owner] = await Promise.all([
    storedCustomer(userId), subscriptionCustomer(userId), ownerForPaddleCustomer(customerId)
  ]);
  if ((existing && existing !== customerId) || (fromSubscription && fromSubscription !== customerId)
    || (owner && owner !== userId)) ownershipConflict();
  if (existing) return;
  const {error} = await createAdminClient().from('billing_customers').insert({user_id: userId, paddle_customer_id: customerId});
  if (tableMissing(error)) {
    logger.info('billing_customers_migration_pending');
    return;
  }
  if (error?.code === '23505') {
    const [current, currentOwner] = await Promise.all([storedCustomer(userId), ownerForPaddleCustomer(customerId)]);
    if (current === customerId && currentOwner === userId) return;
    ownershipConflict();
  }
  if (error) throw new ExternalServiceError();
}

function ownerInCustomerData(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('ownerId' in value)) return null;
  const ownerId = (value as {ownerId?: unknown}).ownerId;
  return typeof ownerId === 'string' ? ownerId : null;
}

async function customerByEmail(paddle: Paddle, email: string, userId: string): Promise<string | null> {
  const matches: string[] = [];
  for await (const customer of paddle.customers.list({email: [email], perPage: 20})) {
    if (customer.email.toLowerCase() !== email.toLowerCase()) continue;
    const ownerId = ownerInCustomerData(customer.customData);
    if (ownerId && ownerId !== userId) ownershipConflict();
    matches.push(customer.id);
    if (matches.length > 1) ownershipConflict();
  }
  return matches[0] ?? null;
}

export async function resolvePaddleCustomer(paddle: Paddle, userId: string, email: string): Promise<string> {
  const stored = await storedCustomer(userId);
  const subscription = await subscriptionCustomer(userId);
  if (stored && subscription && stored !== subscription) ownershipConflict();
  if (stored || subscription) {
    const id = stored ?? subscription!;
    await linkPaddleCustomer(userId, id);
    return id;
  }
  const found = await customerByEmail(paddle, email, userId);
  if (found) {
    await linkPaddleCustomer(userId, found);
    return found;
  }
  let created: string;
  try {
    created = (await paddle.customers.create({email, customData: {ownerId: userId}})).id;
  } catch (error) {
    const details = error instanceof ApiError
      ? [error.detail, error.message, ...(error.errors ?? []).map((field) => field.message)]
      : error instanceof Error ? [error.message] : [];
    const conflictId = details.map((detail) => /customer email conflicts with customer of id\s+(ctm_[a-z0-9]+)/i.exec(detail)?.[1])
      .find((id) => id !== undefined);
    if (!conflictId) throw error;
    logger.info('billing_customer_email_conflict_recovered');
    let foundAfterConflict: string | null = null;
    try { foundAfterConflict = await customerByEmail(paddle, email, userId); }
    catch (lookupError) {
      if (lookupError instanceof ExternalServiceError) throw lookupError;
      logger.warn('billing_customer_conflict_lookup_failed');
    }
    if (foundAfterConflict && foundAfterConflict !== conflictId) ownershipConflict();
    if (!foundAfterConflict) {
      const customer = await paddle.customers.get(conflictId);
      if (customer.email.toLowerCase() !== email.toLowerCase()) ownershipConflict();
      const ownerId = ownerInCustomerData(customer.customData);
      if (ownerId && ownerId !== userId) ownershipConflict();
    }
    created = foundAfterConflict ?? conflictId;
  }
  await linkPaddleCustomer(userId, created);
  return created;
}
