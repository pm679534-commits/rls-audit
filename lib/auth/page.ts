import 'server-only';

import {getLocale} from 'next-intl/server';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {ForbiddenError} from '@/lib/errors';
import {getSession, requireAdmin, type UserContext} from './index';
import {withDeadline} from '@/lib/supabase/deadline';

export async function requirePageUser(): Promise<UserContext> {
  const [context, locale] = await Promise.all([getSession(), getLocale()]);
  if (!context) {
    // A missing profile must not start a sign-in loop for an authenticated user.
    const result = await withDeadline((await createClient()).auth.getUser()).catch(() => null);
    const user = result?.data.user;
    redirect(`/${locale}/${user ? 'not-authorized' : 'sign-in'}`);
  }
  if (!context.user.email_confirmed_at) redirect(`/${locale}/verify-email`);
  if (context.profile.suspended) redirect(`/${locale}/suspended`);
  return context;
}

export async function requirePageAdmin(): Promise<UserContext> {
  const context = await requirePageUser();
  const locale = await getLocale();
  if (context.profile.role !== 'admin') redirect(`/${locale}/not-authorized`);
  try {await requireAdmin();}
  catch (error) {
    if (error instanceof ForbiddenError) redirect(`/${locale}/not-authorized`);
    throw error;
  }
  return context;
}
