'use client';

import {useState, useTransition, type FormEvent} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {changeEmail, changePassword, revokeOtherSessions, signOut} from '@/lib/auth/actions';
import {deleteAccountAction, requestDataExportAction, updatePreferencesAction, updateProfileAction} from '@/lib/account/actions';
import {ApiKeysPanel} from '@/components/dashboard/api-keys-panel';

type Key = {id: string; name: string; key_prefix: string; scopes: string[]; revoked_at: string | null; expires_at: string | null; created_at: string};
type Export = {id: string; status: string; created_at: string; storage_path: string | null};
type Session = {session_id: string; created_at: string; updated_at: string};
type Prefs = {email: boolean; scanCompleted: boolean; findingAlerts: boolean; trialReminders: boolean; productUpdates: boolean};
type Result = {ok: true; data: unknown} | {ok: false; error: {message: string}};

export function AccountSettings({profile, keys, exports, sessions, canApi, fullApi, readOnly}: {profile: {email: string; display_name: string | null; locale: 'en' | 'az'; notification_preferences: unknown}; keys: Key[]; exports: Export[]; sessions: Session[]; canApi: boolean; fullApi: boolean; readOnly: boolean}) {
  const t = useTranslations('Phase5.settings');
  const common = useTranslations('Common');
  const extra = useTranslations('Phase5Labels');
  const router = useRouter();
  const locale = useLocale();
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const p = profile.notification_preferences && typeof profile.notification_preferences === 'object' && !Array.isArray(profile.notification_preferences) ? profile.notification_preferences as Record<string, unknown> : {};
  async function run(operation: () => Promise<Result>, success = t('saved')) {
    setBusy(true); setMessage('');
    const result = await operation();
    setBusy(false);
    setMessage(result.ok ? success : result.error.message);
    if (result.ok) startTransition(() => router.refresh());
    return result;
  }
  function fields(event: FormEvent<HTMLFormElement>) {event.preventDefault(); return new FormData(event.currentTarget);}
  async function saveProfile(event: FormEvent<HTMLFormElement>) { const form = fields(event); const selectedLocale = String(form.get('locale') ?? 'en'); const result = await run(() => updateProfileAction({displayName: String(form.get('displayName') ?? ''), locale: selectedLocale})); if (result.ok && selectedLocale !== locale) window.location.assign(`/${selectedLocale}/dashboard/settings`); }
  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    const form = fields(event);
    await run(() => updatePreferencesAction(Object.fromEntries(['email', 'scanCompleted', 'findingAlerts', 'trialReminders', 'productUpdates'].map((key) => [key, form.has(key)])) as Prefs));
  }
  async function saveEmail(event: FormEvent<HTMLFormElement>) { const form = fields(event); await run(() => changeEmail({email: String(form.get('email') ?? '')}), t('emailSent')); }
  async function savePassword(event: FormEvent<HTMLFormElement>) { const form = fields(event); await run(() => changePassword({password: String(form.get('password') ?? '')})); }
  async function removeAccount() {
    const result = await run(() => deleteAccountAction({confirmation}));
    if (result.ok) window.location.assign(`/${locale}`);
  }
  const card = 'space-y-4 rounded-xl border bg-card p-5';
  return <div className="space-y-8">
    <div><h1 className="font-display text-3xl">{t('title')}</h1><p className="mt-2 text-muted-foreground">{t('description')}</p></div>
    {message && <p role="status" className="rounded-lg border bg-muted p-4 text-sm">{message}</p>}
    <div className="grid gap-6 lg:grid-cols-2">
      <form className={card} onSubmit={saveProfile}><h2 className="text-xl font-semibold">{t('profile')}</h2><p className="text-sm text-muted-foreground">{profile.email}</p><div className="space-y-2"><Label htmlFor="display-name">{t('displayName')}</Label><Input id="display-name" name="displayName" defaultValue={profile.display_name ?? ''} maxLength={120} disabled={readOnly} /></div><div className="space-y-2"><Label htmlFor="profile-locale">{t('language')}</Label><select id="profile-locale" name="locale" defaultValue={profile.locale} disabled={readOnly} className="w-full rounded-md border bg-background p-2"><option value="en">{common('english')}</option><option value="az">{common('azerbaijani')}</option></select></div><Button disabled={busy || readOnly}>{t('save')}</Button></form>
      <form className={card} onSubmit={savePreferences}><h2 className="text-xl font-semibold">{t('notifications')}</h2>{(['email','scanCompleted','findingAlerts','trialReminders','productUpdates'] as const).map((key) => <label key={key} className="flex items-center gap-3 text-sm"><input type="checkbox" name={key} defaultChecked={p[key] === true} disabled={readOnly} className="size-4" />{t(`preference.${key}`)}</label>)}<Button disabled={busy || readOnly}>{t('save')}</Button></form>
      <form className={card} onSubmit={saveEmail}><h2 className="text-xl font-semibold">{t('changeEmail')}</h2><Label htmlFor="new-email">{t('newEmail')}</Label><Input id="new-email" name="email" type="email" required disabled={readOnly} /><Button disabled={busy || readOnly}>{t('sendConfirmation')}</Button></form>
      <form className={card} onSubmit={savePassword}><h2 className="text-xl font-semibold">{t('changePassword')}</h2><Label htmlFor="new-password">{t('newPassword')}</Label><Input id="new-password" name="password" type="password" minLength={12} autoComplete="new-password" required disabled={readOnly} /><Button disabled={busy || readOnly}>{t('save')}</Button></form>
    </div>
    <ApiKeysPanel keys={keys} canApi={canApi} fullApi={fullApi} readOnly={readOnly} />
    <div className="grid gap-6 lg:grid-cols-2"><section className={card}><h2 className="text-xl font-semibold">{t('sessions')}</h2><ul className="space-y-2 text-sm">{sessions.map((session) => <li key={session.session_id} className="border-t pt-2">{t('sessionSince', {date: new Date(session.created_at).toLocaleString()})}</li>)}</ul><Button type="button" variant="outline" disabled={busy} onClick={() => run(() => revokeOtherSessions())}>{t('signOutOthers')}</Button><Button type="button" variant="outline" disabled={busy} onClick={async () => {await signOut(); window.location.assign(`/${locale}/sign-in`);}}>{t('signOut')}</Button></section>
      <section className={card}><h2 className="text-xl font-semibold">{t('dataExport')}</h2><p className="text-sm text-muted-foreground">{t('exportDescription')}</p><Button type="button" disabled={busy} onClick={() => run(() => requestDataExportAction(), t('exportQueued'))}>{t('requestExport')}</Button><ul className="space-y-2 text-sm">{exports.map((item) => <li key={item.id} className="border-t pt-2">{new Date(item.created_at).toLocaleString()} · {extra(`exportStatus.${item.status}`)} {item.status === 'completed' && item.storage_path && <a className="text-primary underline" href={`/api/account/export/${item.id}`}>{t('download')}</a>}</li>)}</ul></section></div>
    <section className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5"><h2 className="text-xl font-semibold">{t('deleteAccount')}</h2><p className="text-sm text-muted-foreground">{t('deleteWarning')}</p><Label htmlFor="delete-account">{t('typeDelete')}</Label><Input id="delete-account" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /><Button type="button" variant="destructive" disabled={busy || confirmation !== 'DELETE'} onClick={removeAccount}>{t('deleteAccount')}</Button></section>
  </div>;
}
