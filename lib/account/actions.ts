'use server';

import {z} from 'zod';
import {createServerAction} from '@/lib/actions';
import {localeSchema} from '@/lib/validation';
import {createApiKey, deleteAccount, requestDataExport, revokeApiKey, updateNotificationPreferences, updateProfile} from './index';
import {API_SCOPES} from './scopes';
import {UnauthenticatedError} from '@/lib/errors';
import {cookies} from 'next/headers';

const preferences = z.object({email: z.boolean(), scanCompleted: z.boolean(), findingAlerts: z.boolean(), trialReminders: z.boolean(), productUpdates: z.boolean()});

export async function updateProfileAction(raw: unknown) {
  return createServerAction(z.object({displayName: z.string().max(120), locale: localeSchema}), async (input, context) => {
    if (!context) throw new UnauthenticatedError();
    await updateProfile(context, input);
    (await cookies()).set('siteguard_locale', input.locale, {path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production'});
    return {updated: true};
  })(raw);
}

export async function updatePreferencesAction(raw: unknown) {
  return createServerAction(preferences, async (input, context) => {
    if (!context) throw new UnauthenticatedError();
    await updateNotificationPreferences(context, input);
    return {updated: true};
  })(raw);
}

export async function createApiKeyAction(raw: unknown) {
  return createServerAction(z.object({name: z.string().trim().min(1).max(120), scopes: z.array(z.enum(API_SCOPES)).min(1).max(6), expiresAt: z.string().datetime().optional()}), async (input, context) => {
    if (!context) throw new UnauthenticatedError();
    return {key: await createApiKey(context, input)};
  }, {rateLimit: {name: 'api-key-create', limit: 10, windowSeconds: 3600}})(raw);
}

export async function revokeApiKeyAction(raw: unknown) {
  return createServerAction(z.object({id: z.string().uuid()}), async (input, context) => {
    if (!context) throw new UnauthenticatedError();
    await revokeApiKey(context, input.id);
    return {revoked: true};
  })(raw);
}

export async function requestDataExportAction() {
  return createServerAction(z.object({}), async (_input, context) => {
    if (!context) throw new UnauthenticatedError();
    await requestDataExport(context);
    return {queued: true};
  }, {rateLimit: {name: 'account-export', limit: 3, windowSeconds: 86400}})({});
}

export async function deleteAccountAction(raw: unknown) {
  return createServerAction(z.object({confirmation: z.literal('DELETE')}), async (input, context) => {
    if (!context) throw new UnauthenticatedError();
    await deleteAccount(context, input.confirmation);
    return {deleted: true};
  }, {rateLimit: {name: 'account-delete', limit: 3, windowSeconds: 3600}})(raw);
}
