'use server';

import {z} from 'zod';
import {createServerAction} from '@/lib/actions';
import {addNotificationChannel, markAllNotificationsRead, markNotificationsRead, removeNotificationChannel, setNotificationChannelEnabled} from './index';

export async function markAllNotificationsReadAction(raw: unknown) {
  return createServerAction(z.object({}), async () => {
    await markAllNotificationsRead(); return {updated: true};
  })(raw);
}

export async function markNotificationsReadAction(raw: unknown) {
  return createServerAction(z.object({ids: z.array(z.string().uuid()).min(1).max(100)}), async (input) => {
    await markNotificationsRead(input.ids); return {updated: true};
  })(raw);
}
export async function addChannelAction(raw: unknown) {
  return createServerAction(z.object({name: z.string().trim().min(1).max(120), type: z.enum(['slack','discord','webhook']),
    url: z.string().url().max(2048), siteId: z.string().uuid().optional()}), async (input) => addNotificationChannel(input),
    {rateLimit: {name: 'channel-create', limit: 10, windowSeconds: 3600}})(raw);
}
export async function toggleChannelAction(raw: unknown) {
  return createServerAction(z.object({id: z.string().uuid(), enabled: z.boolean()}), async (input) => {
    await setNotificationChannelEnabled(input.id, input.enabled); return {updated: true};
  })(raw);
}
export async function removeChannelAction(raw: unknown) {
  return createServerAction(z.object({id: z.string().uuid()}), async (input) => {
    await removeNotificationChannel(input.id); return {removed: true};
  })(raw);
}
