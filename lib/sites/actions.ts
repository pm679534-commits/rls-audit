'use server';

import {z} from 'zod';
import {createServerAction} from '@/lib/actions';
import {urlSchema} from '@/lib/validation';
import {addSite, editSite, deleteSite, setSitePaused, beginVerification, verifySiteNow} from './index';
import {createScan} from '@/lib/scanner';

const site = z.object({url: urlSchema, name: z.string().trim().min(1).max(120)});
const siteId = z.object({siteId: z.string().uuid()});

export async function addSiteAction(raw: unknown) {
  return createServerAction(site, async (input) => addSite(input), {rateLimit: {name: 'site-add', limit: 10, windowSeconds: 3600}})(raw);
}

export async function editSiteAction(raw: unknown) {
  return createServerAction(site.extend({siteId: z.string().uuid()}), async (input) => editSite(input.siteId, input), {rateLimit: {name: 'site-edit', limit: 20, windowSeconds: 3600}})(raw);
}

export async function deleteSiteAction(raw: unknown) {
  return createServerAction(siteId.extend({confirmation: z.literal('DELETE')}), async (input) => { await deleteSite(input.siteId); return {deleted: true}; }, {rateLimit: {name: 'site-delete', limit: 10, windowSeconds: 3600}})(raw);
}

export async function pauseSiteAction(raw: unknown) {
  return createServerAction(siteId.extend({paused: z.boolean()}), async (input) => setSitePaused(input.siteId, input.paused), {rateLimit: {name: 'site-pause', limit: 20, windowSeconds: 3600}})(raw);
}

export async function beginVerificationAction(raw: unknown) {
  return createServerAction(siteId.extend({method: z.enum(['dns_txt', 'meta_tag', 'well_known_file'])}), async (input) => beginVerification(input.siteId, input.method), {rateLimit: {name: 'verify-start', limit: 10, windowSeconds: 3600}})(raw);
}

export async function verifySiteAction(raw: unknown) {
  return createServerAction(siteId, async (input) => verifySiteNow(input.siteId), {rateLimit: {name: 'verify-check', limit: 20, windowSeconds: 3600}})(raw);
}

export async function startScanAction(raw: unknown) {
  return createServerAction(siteId.extend({idempotencyKey: z.string().min(8).max(200), kind: z.enum(['manual','passive']).optional()}), async (input) => createScan({...input, kind: input.kind ?? 'manual'}), {rateLimit: {name: 'scan-start', limit: 30, windowSeconds: 3600}})(raw);
}
