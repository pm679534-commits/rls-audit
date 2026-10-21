'use server';

import {z} from 'zod';
import {createServerAction} from '@/lib/actions';
import {createShareLink, revokeShareLink, reportExportQueue} from './index';

const target = z.object({siteId: z.string().uuid(), scanId: z.string().uuid()});

export async function createShareLinkAction(raw: unknown) {
  return createServerAction(target, async (input) => createShareLink(input.siteId, input.scanId),
    {rateLimit: {name: 'report-share', limit: 20, windowSeconds: 3600}})(raw);
}

export async function revokeShareLinkAction(raw: unknown) {
  return createServerAction(z.object({id: z.string().uuid()}), async (input) => {
    await revokeShareLink(input.id); return {revoked: true};
  })(raw);
}

export async function requestReportExportAction(raw: unknown) {
  return createServerAction(target.extend({format: z.enum(['pdf', 'csv', 'json'])}), async (input) => {
    const item = await reportExportQueue.request(input.siteId, input.scanId, input.format);
    return {id: item.id, status: item.status};
  }, {rateLimit: {name: 'report-export', limit: 20, windowSeconds: 3600}})(raw);
}
