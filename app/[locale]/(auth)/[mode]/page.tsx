import {notFound} from 'next/navigation';
import {headers} from 'next/headers';
import {getPublicEnv} from '@/lib/env';
import {AuthForm, type AuthMode} from '@/components/auth/auth-form';

const modes: AuthMode[] = ['sign-up', 'sign-in', 'magic-link', 'verify-email', 'forgot-password', 'reset-password'];

export default async function AuthPage({params, searchParams}: {params: Promise<{mode: string}>; searchParams: Promise<{error?: string; next?: string}>}) {
  const {mode} = await params;
  const query = await searchParams;
  if (!modes.includes(mode as AuthMode)) notFound();
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return <AuthForm mode={mode as AuthMode} turnstileKey={getPublicEnv().NEXT_PUBLIC_TURNSTILE_SITE_KEY} nonce={nonce} callbackError={query.error === 'callback'} next={query.next} />;
}
