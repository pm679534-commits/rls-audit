import 'server-only';

import {createAdminClient} from '@/lib/supabase/admin';
import {requireCanAddSite, requireSiteAccess, requireUser} from '@/lib/auth';
import {BlockedDomainError, ConflictError, DomainClaimedError, ForbiddenError, NotFoundError, ValidationError} from '@/lib/errors';
import {secureRandomToken} from '@/lib/crypto';
import {normalizeSiteUrl} from '@/lib/ssrf';
import {systemNumberSetting} from '@/lib/system/config';
import {logger, logUnexpectedError} from '@/lib/logger';
import type {Tables, Enums} from '@/types/database';
import {verifyChallengeEvidence, type VerificationOutcome} from './verification';

const CHALLENGE_HOURS = 24;
type Method = Enums<'verification_method'>;

async function checkedUrl(input: string) {
  const normalized = normalizeSiteUrl(input);
  const {data, error} = await createAdminClient().rpc('is_blocked_domain', {p_domain: normalized.hostname});
  if (error) throw new Error('Could not check domain policy');
  if (data) throw new BlockedDomainError();
  return normalized;
}

export async function addSite(input: {url: string; name: string}): Promise<Tables<'sites'>> {
  const context = await requireUser();
  await requireCanAddSite(context);
  const name = input.name.trim();
  if (!name || name.length > 120) throw new ValidationError();
  const normalized = await checkedUrl(input.url);
  const db = createAdminClient();
  const {data: existing} = await db.from('sites').select('id').eq('owner_id', context.user.id).eq('domain', normalized.domain).maybeSingle();
  if (existing) throw new ConflictError();
  const {data, error} = await db.from('sites').insert({owner_id: context.user.id, name, normalized_url: normalized.url, domain: normalized.domain}).select('*').single();
  if (error || !data) throw error?.code === '23505' ? new ConflictError() : new ForbiddenError();
  return data;
}

export async function editSite(siteId: string, input: {url: string; name: string}): Promise<Tables<'sites'>> {
  const site = await requireSiteAccess(siteId, 'edit');
  const name = input.name.trim();
  if (!name || name.length > 120) throw new ValidationError();
  const normalized = await checkedUrl(input.url);
  const changed = normalized.domain !== site.domain || normalized.url !== site.normalized_url;
  const {data, error} = await createAdminClient().from('sites').update({
    name, normalized_url: normalized.url, domain: normalized.domain,
    ...(changed ? {verified_at: null, verification_due_at: null, next_scan_at: null} : {})
  }).eq('id', site.id).select('*').single();
  if (error || !data) throw error?.code === '23505' ? new ConflictError() : new ForbiddenError();
  return data;
}

export async function deleteSite(siteId: string): Promise<void> {
  const site = await requireSiteAccess(siteId, 'edit');
  const {error} = await createAdminClient().from('sites').delete().eq('id', site.id).eq('owner_id', site.owner_id);
  if (error) throw new Error('Could not delete site');
}

export async function setSitePaused(siteId: string, paused: boolean): Promise<Tables<'sites'>> {
  const site = await requireSiteAccess(siteId, 'edit');
  if (!paused) {
    const context = await requireUser();
    if (context.user.id !== site.owner_id) throw new ForbiddenError();
    await requireCanAddSite(context);
  }
  const {data, error} = await createAdminClient().from('sites').update({status: paused ? 'paused' : 'active', paused_reason: paused ? 'user' : null, next_scan_at: paused ? null : new Date().toISOString()}).eq('id', siteId).select('*').single();
  if (error || !data) throw new ForbiddenError();
  return data;
}

export async function beginVerification(siteId: string, method: Method): Promise<Tables<'site_verifications'>> {
  const site = await requireSiteAccess(siteId, 'edit');
  if (site.status !== 'active') throw new ForbiddenError();
  const token = `siteguard-${secureRandomToken(24)}`;
  const db = createAdminClient();
  const {error: expireError} = await db.from('site_verifications').update({status: 'expired', error_code: 'replaced'}).eq('site_id', site.id).eq('status', 'pending');
  if (expireError) throw new Error('Could not replace verification challenge');
  const {data, error} = await db.from('site_verifications').insert({site_id: site.id, method, challenge_value: token, expires_at: new Date(Date.now() + CHALLENGE_HOURS * 3600_000).toISOString()}).select('*').single();
  if (error || !data) throw new Error('Could not create verification challenge');
  logger.info('verification.challenge_started', {siteId: site.id, challengeId: data.id, method});
  return data;
}

async function checkVerification(site: Tables<'sites'>, challenge: Tables<'site_verifications'>, renewal: boolean): Promise<VerificationOutcome> {
  const db = createAdminClient();
  const now = new Date().toISOString();
  if (new Date(challenge.expires_at).getTime() <= Date.now() && !renewal) {
    await db.from('site_verifications').update({status: 'expired', checked_at: now, error_code: 'challenge_expired'}).eq('id', challenge.id);
    return {verified: false, reason: 'challenge_expired'};
  }
  logger.info('verification.attempt_started', {siteId: site.id, challengeId: challenge.id, method: challenge.method});
  let outcome: VerificationOutcome;
  try { outcome = await verifyChallengeEvidence(site, challenge); }
  catch (error) {
    logUnexpectedError('verification.attempt_failed', error, {siteId: site.id, challengeId: challenge.id, method: challenge.method});
    outcome = {verified: false, reason: 'verification_unavailable'};
  }
  logger.info('verification.attempt_finished', {siteId: site.id, challengeId: challenge.id, method: challenge.method, verified: outcome.verified, reasonCode: outcome.reason, httpStatus: outcome.httpStatus});
  if (!outcome.verified) {
    const {error: saveError} = await db.from('site_verifications').update({status: renewal ? 'failed' : 'pending', attempts: challenge.attempts + 1, checked_at: now, error_code: outcome.reason === 'http_status' ? `http_${outcome.httpStatus}` : outcome.reason}).eq('id', challenge.id);
    if (saveError) throw new Error('Could not save verification attempt');
    if (renewal) await markVerificationFailed(site);
    return outcome;
  }
  const verifyDays = await systemNumberSetting('verification_recheck_days', 30);
  let update = db.from('sites').update({verified_at: now, verification_due_at: new Date(Date.now() + verifyDays * 86400_000).toISOString(), next_scan_at: new Date().toISOString()}).eq('id', site.id).eq('domain', site.domain).eq('normalized_url', site.normalized_url);
  if (renewal && site.verification_due_at) update = update.eq('verification_due_at', site.verification_due_at);
  const {data: updated, error: siteError} = await update.select('id').maybeSingle();
  if (siteError) {
    if (siteError.code === '23505') throw new DomainClaimedError();
    throw new Error('Could not mark site verified');
  }
  if (!updated) throw new ConflictError();
  const {error: verificationError} = await db.from('site_verifications').update({status: 'verified', attempts: challenge.attempts + 1, checked_at: now, verified_at: now, error_code: null}).eq('id', challenge.id);
  if (verificationError) throw new Error('Could not save verification result');
  return {verified: true};
}

async function markVerificationFailed(site: Tables<'sites'>): Promise<void> {
  const db = createAdminClient();
  const {data, error} = await db.from('sites').update({verified_at: null, verification_due_at: null, next_scan_at: null}).eq('id', site.id).eq('verification_due_at', site.verification_due_at!).select('id').maybeSingle();
  if (error) throw new Error('Could not pause deep scans');
  if (data) {
    const {error: notificationError} = await db.from('notifications').insert({user_id: site.owner_id, site_id: site.id, type: 'verification_failed', title_key: 'Notifications.verificationFailedTitle', body_key: 'Notifications.verificationFailedBody'});
    if (notificationError) throw new Error('Could not notify verification failure');
  }
}

export async function verifySiteNow(siteId: string): Promise<VerificationOutcome> {
  const site = await requireSiteAccess(siteId, 'edit');
  if (site.status !== 'active') throw new ForbiddenError();
  const {data: challenge} = await createAdminClient().from('site_verifications').select('*').eq('site_id', siteId).eq('status', 'pending').order('created_at', {ascending: false}).limit(1).maybeSingle();
  if (!challenge) throw new NotFoundError();
  return checkVerification(site, challenge, false);
}

export async function recheckDueVerifications(limit = 20): Promise<{checked: number; failed: number}> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ValidationError();
  const db = createAdminClient();
  const now = new Date().toISOString();
  const {data: pending, error: pendingError} = await db.from('site_verifications').select('*').eq('status', 'pending').gt('expires_at', now).or(`checked_at.is.null,checked_at.lt.${new Date(Date.now() - 55 * 60_000).toISOString()}`).order('created_at').limit(limit);
  if (pendingError) throw new Error('Could not load pending verifications');
  let checked = 0;
  let failed = 0;
  for (const challenge of pending ?? []) {
    const {data: site} = await db.from('sites').select('*').eq('id', challenge.site_id).eq('status', 'active').maybeSingle();
    if (!site || site.verified_at) continue;
    if (!(await checkVerification(site, challenge, false)).verified) failed++;
    checked++;
  }
  const {data: sites, error} = await db.from('sites').select('*').eq('status', 'active').not('verified_at', 'is', null).lte('verification_due_at', now).order('verification_due_at').limit(Math.max(0, limit - checked));
  if (error) throw new Error('Could not load due verifications');
  for (const site of sites ?? []) {
    const {data: challenge} = await db.from('site_verifications').select('*').eq('site_id', site.id).eq('status', 'verified').order('verified_at', {ascending: false}).limit(1).maybeSingle();
    if (!challenge) {await markVerificationFailed(site); failed++;}
    else if (!(await checkVerification(site, challenge, true)).verified) failed++;
  }
  return {checked: checked + (sites?.length ?? 0), failed};
}

