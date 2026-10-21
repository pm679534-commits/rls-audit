'use server';

import {z} from 'zod';
import {createServerAction} from '@/lib/actions';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getSiteUrl} from '@/lib/config';
import {verifyTurnstile} from '@/lib/turnstile';
import {emailSchema, localeSchema, passwordSchema} from '@/lib/validation';
import {DisposableEmailError, EmailUnverifiedError, UnauthenticatedError, ValidationError} from '@/lib/errors';
import {requireMutationAccess} from './trial';
import {sendEmail} from '@/lib/email';
import {emailTemplate} from '@/lib/email/templates';

const safeNext = z.string().regex(/^\/dashboard\/team\/invite\?token=[A-Za-z0-9_-]{43}$/).optional();
const credentials = z.object({email: emailSchema, password: passwordSchema, locale: localeSchema, turnstileToken: z.string().max(4096).optional(), next: safeNext});
const emailInput = z.object({email: emailSchema, locale: localeSchema, turnstileToken: z.string().max(4096).optional(), next: safeNext});
const passwordInput = z.object({password: passwordSchema});
const providerInput = z.object({provider: z.enum(['google', 'github']), locale: localeSchema, next: safeNext});

function callback(locale: string, next = '/onboarding') {
  return getSiteUrl(`/${locale}/auth/callback?next=${encodeURIComponent(next)}`).toString();
}

async function rejectDisposable(email: string): Promise<void> {
  const domain = email.split('@')[1];
  const {data, error} = await createAdminClient().from('disposable_email_domains').select('domain').eq('domain', domain).maybeSingle();
  if (error) throw new Error('Email check unavailable');
  if (data) throw new DisposableEmailError();
}

export async function signUp(raw: unknown) {
  return createServerAction(credentials, async (input) => {
    await verifyTurnstile(input.turnstileToken, {action: 'signup', hostname: getSiteUrl().hostname});
    await rejectDisposable(input.email);
    const {data, error} = await createAdminClient().auth.admin.generateLink({type: 'signup', email: input.email, password: input.password,
      options: {redirectTo: callback(input.locale, input.next), data: {locale: input.locale}}});
    if (error) {
      if (/disposable/i.test(error.message)) throw new DisposableEmailError();
      throw new ValidationError();
    }
    if (!data?.properties.action_link) throw new Error('Could not create verification link');
    await sendEmail({to: input.email, locale: input.locale,
      ...emailTemplate('verification', input.locale, {url: data.properties.action_link})});
    return {sent: true};
  }, {access: 'public', rateLimit: {name: 'auth-signup', limit: 5, windowSeconds: 3600}})(raw);
}

export async function signIn(raw: unknown) {
  return createServerAction(credentials, async (input) => {
    await verifyTurnstile(input.turnstileToken, {action: 'signin', hostname: getSiteUrl().hostname});
    const db = await createClient();
    const {data, error} = await db.auth.signInWithPassword({email: input.email, password: input.password});
    if (error && /email not confirmed/i.test(error.message)) throw new EmailUnverifiedError();
    if (error || !data.user) throw new UnauthenticatedError();
    if (!data.user.email_confirmed_at) throw new EmailUnverifiedError();
    return {redirect: `/${input.locale}${input.next ?? '/onboarding'}`};
  }, {access: 'public', rateLimit: {name: 'auth-signin', limit: 10, windowSeconds: 900}})(raw);
}

export async function sendMagicLink(raw: unknown) {
  return createServerAction(emailInput, async (input) => {
    await verifyTurnstile(input.turnstileToken, {action: 'magic_link', hostname: getSiteUrl().hostname});
    const db = await createClient();
    const {error} = await db.auth.signInWithOtp({email: input.email, options: {emailRedirectTo: callback(input.locale, input.next), shouldCreateUser: false}});
    if (error && !/not found|user not found/i.test(error.message)) throw new Error('Could not send sign-in link');
    return {sent: true};
  }, {access: 'public', rateLimit: {name: 'auth-magic', limit: 5, windowSeconds: 3600}})(raw);
}

export async function startOAuth(raw: unknown) {
  return createServerAction(providerInput, async (input) => {
    const db = await createClient();
    const {data, error} = await db.auth.signInWithOAuth({provider: input.provider, options: {redirectTo: callback(input.locale, input.next)}});
    if (error || !data.url) throw new Error('OAuth unavailable');
    return {redirect: data.url};
  }, {access: 'public', rateLimit: {name: 'auth-oauth', limit: 20, windowSeconds: 3600}})(raw);
}

export async function resendVerification(raw: unknown) {
  return createServerAction(emailInput, async (input) => {
    await verifyTurnstile(input.turnstileToken, {action: 'resend_verification', hostname: getSiteUrl().hostname});
    const admin = createAdminClient();
    const {data: profile} = await admin.from('profiles').select('id').eq('email', input.email).maybeSingle();
    if (profile) {
      const {data: account} = await admin.auth.admin.getUserById(profile.id);
      if (account.user && !account.user.email_confirmed_at) {
        const {data: link, error} = await admin.auth.admin.generateLink({type: 'magiclink', email: input.email,
          options: {redirectTo: callback(input.locale, input.next)}});
        if (error || !link?.properties.action_link) throw new Error('Could not create verification link');
        await sendEmail({to: input.email, locale: input.locale,
          ...emailTemplate('verification', input.locale, {url: link.properties.action_link})});
      }
    }
    return {sent: true};
  }, {access: 'public', rateLimit: {name: 'auth-resend', limit: 5, windowSeconds: 3600}})(raw);
}

export async function forgotPassword(raw: unknown) {
  return createServerAction(emailInput, async (input) => {
    await verifyTurnstile(input.turnstileToken, {action: 'forgot_password', hostname: getSiteUrl().hostname});
    const db = await createClient();
    await db.auth.resetPasswordForEmail(input.email, {redirectTo: callback(input.locale, '/reset-password')});
    return {sent: true};
  }, {access: 'public', rateLimit: {name: 'auth-forgot', limit: 5, windowSeconds: 3600}})(raw);
}

export async function resetPassword(raw: unknown) {
  return createServerAction(passwordInput, async (input) => {
    const db = await createClient();
    const {data: {user}} = await db.auth.getUser();
    if (!user) throw new UnauthenticatedError();
    const {error} = await db.auth.updateUser({password: input.password});
    if (error) throw new ValidationError();
    return {updated: true};
  }, {access: 'public', rateLimit: {name: 'auth-reset', limit: 5, windowSeconds: 3600}})(raw);
}

export async function changePassword(raw: unknown) {
  return createServerAction(passwordInput, async (input, context) => {
    if (!context) throw new UnauthenticatedError();
    await requireMutationAccess(context);
    const {error} = await (await createClient()).auth.updateUser({password: input.password});
    if (error) throw new ValidationError();
    return {updated: true};
  }, {rateLimit: {name: 'auth-change-password', limit: 5, windowSeconds: 3600}})(raw);
}

export async function changeEmail(raw: unknown) {
  return createServerAction(z.object({email: emailSchema}), async (input, context) => {
    if (!context) throw new UnauthenticatedError();
    await requireMutationAccess(context);
    await rejectDisposable(input.email);
    const {error} = await (await createClient()).auth.updateUser({email: input.email}, {emailRedirectTo: callback(context.profile.locale, '/dashboard/settings')});
    if (error) throw new ValidationError();
    return {sent: true};
  }, {rateLimit: {name: 'auth-change-email', limit: 3, windowSeconds: 3600}})(raw);
}

export async function signOut() {
  return createServerAction(z.object({}), async () => {
    await (await createClient()).auth.signOut();
    return {redirect: '/en/sign-in'};
  }, {access: 'public'})({});
}

export async function revokeOtherSessions() {
  return createServerAction(z.object({}), async () => {
    const {error} = await (await createClient()).auth.signOut({scope: 'others'});
    if (error) throw new Error('Could not revoke sessions');
    return {updated: true};
  })({});
}
