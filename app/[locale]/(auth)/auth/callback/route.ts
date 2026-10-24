import {NextResponse, after, type NextRequest} from 'next/server';
import {createServerClient} from '@supabase/ssr';
import {getPublicEnv} from '@/lib/env';
import {createAdminClient} from '@/lib/supabase/admin';
import {z} from 'zod';
import {logUnexpectedError} from '@/lib/logger';

const callbackQuery = z.object({
  code: z.string().min(1).max(4096).optional(),
  next: z.string().max(256).optional()
});

export async function GET(request: NextRequest, {params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params;
  const language = locale === 'az' ? 'az' : 'en';
  const env = getPublicEnv();
  const base = new URL(env.NEXT_PUBLIC_SITE_URL);
  const parsed = callbackQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const code = parsed.success ? parsed.data.code : undefined;
  const requested = parsed.success ? parsed.data.next : undefined;
  const next = requested === '/reset-password' || requested === '/dashboard/settings' || (requested && /^\/dashboard\/team\/invite\?token=[A-Za-z0-9_-]{43}$/.test(requested)) ? requested : '/onboarding';
  if (!code) return NextResponse.redirect(new URL(`/${language}/sign-in?error=callback`, base));
  const response = NextResponse.redirect(new URL(`/${language}${next}`, base));
  const db = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => values.forEach(({name, value, options}) => response.cookies.set(name, value, options))
    }
  });
  const {data, error} = await db.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL(`/${language}/sign-in?error=callback`, base));
  if (data.user?.email_confirmed_at && next === '/onboarding') {
    const userId = data.user.id;
    after(async () => {
      try {
        const {error: insertError} = await createAdminClient().from('notifications').insert({user_id: userId, type: 'welcome',
          title_key: 'Notifications.welcomeTitle', body_key: 'Notifications.welcomeBody', data: {eventKey: `welcome:${userId}`}});
        if (insertError && insertError.code !== '23505') throw insertError;
      } catch (failure) {logUnexpectedError('auth_welcome_notification_failed', failure, {userId});}
    });
  }
  return response;
}
