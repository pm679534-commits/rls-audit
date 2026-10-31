'use client';

import {useState, useTransition, type FormEvent} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {saveScanSettingsAction, saveSupabaseConfigAction, saveTestAccountsAction, clearScannerSecretAction} from '@/lib/dashboard/actions';
import {SCAN_MODULE_KEYS} from '@/lib/dashboard/constants';
import type {Tables} from '@/types/database';

export function SiteScanSettings({site, minHours, presence, canEdit, verified}: {site: Tables<'sites'>; minHours: number | null;
  presence: {manualConfig: boolean; testAccounts: boolean}; canEdit: boolean; verified: boolean}) {
  const t = useTranslations('Phase7');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  async function run(action: () => Promise<{ok: boolean; error?: {message: string}}>) {
    setBusy(true); setMessage('');
    const result = await action();
    setBusy(false); setMessage(result.ok ? t('settingsSaved') : result.error?.message ?? t('actionFailed'));
    if (result.ok) startTransition(() => router.refresh());
  }
  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const raw = String(form.get('interval') ?? 'default');
    await run(() => saveScanSettingsAction({siteId: site.id, intervalHours: raw === 'default' ? null : Number(raw),
      modules: SCAN_MODULE_KEYS.filter((key) => form.has(key))}));
  }
  async function saveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const target = event.currentTarget; const form = new FormData(target);
    await run(() => saveSupabaseConfigAction({siteId: site.id, projectUrl: String(form.get('projectUrl') ?? ''), anonKey: String(form.get('anonKey') ?? '')}));
    target.reset();
  }
  async function saveAccounts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const target = event.currentTarget; const form = new FormData(target);
    await run(() => saveTestAccountsAction({siteId: site.id, accounts: [
      {email: String(form.get('email1') ?? ''), password: String(form.get('password1') ?? '')},
      {email: String(form.get('email2') ?? ''), password: String(form.get('password2') ?? '')}
    ]})); target.reset();
  }
  if (!canEdit) return null;
  return <section className="space-y-6 rounded-xl border bg-card p-5"><div><h2 className="text-xl font-semibold">{t('scanSettings')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('scanSettingsDescription')}</p></div>
    <form onSubmit={saveSettings} className="space-y-4"><label className="block text-sm font-medium" htmlFor="scan-interval">{t('scanFrequency')}</label><select id="scan-interval" name="interval" defaultValue={site.scan_interval_hours && minHours && site.scan_interval_hours >= minHours ? site.scan_interval_hours : 'default'} className="w-full rounded-md border bg-background px-3 py-2 text-sm"><option value="default">{t('planDefault')}</option>{([24,168,720] as const).filter((value) => minHours !== null && value >= minHours).map((hours) => <option key={hours} value={hours}>{t(`frequency.${hours}`)}</option>)}</select>
      <fieldset><legend className="text-sm font-medium">{t('scanModules')}</legend><div className="mt-2 flex flex-wrap gap-4">{SCAN_MODULE_KEYS.map((key) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" name={key} defaultChecked={site.enabled_modules.includes(key)} />{t(`module.${key}`)}</label>)}</div></fieldset><Button disabled={busy}>{t('saveSettings')}</Button></form>
    {verified && <div className="space-y-5 border-t pt-5"><div><h3 className="font-semibold">{t('manualSupabase')}</h3><p className="text-sm text-muted-foreground">{t('manualSupabaseDescription')}</p><p className="mt-1 text-xs">{presence.manualConfig ? t('configured') : t('notConfigured')}</p></div><form onSubmit={saveConfig} className="grid gap-3"><Input name="projectUrl" type="url" placeholder="https://project.supabase.co/" aria-label={t('projectUrl')} required /><Input name="anonKey" type="password" autoComplete="off" placeholder={t('anonKey')} aria-label={t('anonKey')} required /><Button disabled={busy}>{t('saveCredentials')}</Button></form>{presence.manualConfig && <Button type="button" variant="outline" disabled={busy} onClick={() => run(() => clearScannerSecretAction({siteId: site.id, kind: 'supabase_scan_config'}))}>{t('clearCredentials')}</Button>}
      <div className="border-t pt-5"><h3 className="font-semibold">{t('crossUserTest')}</h3><p className="mt-1 text-sm text-muted-foreground">{t('crossUserDescription')}</p><p className="mt-1 text-xs">{presence.testAccounts ? t('configured') : t('notConfigured')}</p>{presence.manualConfig ? <form onSubmit={saveAccounts} className="mt-3 grid gap-3 sm:grid-cols-2"><Input name="email1" type="email" placeholder={t('testEmailOne')} aria-label={t('testEmailOne')} required /><Input name="password1" type="password" autoComplete="off" placeholder={t('testPasswordOne')} aria-label={t('testPasswordOne')} required /><Input name="email2" type="email" placeholder={t('testEmailTwo')} aria-label={t('testEmailTwo')} required /><Input name="password2" type="password" autoComplete="off" placeholder={t('testPasswordTwo')} aria-label={t('testPasswordTwo')} required /><Button disabled={busy}>{t('saveTestAccounts')}</Button></form> : <p className="mt-2 text-sm text-muted-foreground">{t('configureProjectFirst')}</p>}{presence.testAccounts && <Button type="button" variant="outline" className="mt-3" disabled={busy} onClick={() => run(() => clearScannerSecretAction({siteId: site.id, kind: 'scanner_test_accounts'}))}>{t('clearTestAccounts')}</Button>}</div></div>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
