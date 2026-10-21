'use client';

import {useState, type FormEvent} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Link} from '@/i18n/navigation';
import {addChannelAction, markAllNotificationsReadAction, markNotificationsReadAction, removeChannelAction, toggleChannelAction} from '@/lib/notifications/actions';
import type {Tables} from '@/types/database';

type Channel = Pick<Tables<'notification_channels'>, 'id'|'name'|'type'|'site_id'|'enabled'|'last_delivered_at'|'last_error_code'|'created_at'>;
type Site = Pick<Tables<'sites'>, 'id'|'name'>;

export function NotificationCenter({notifications, unread, channels, sites, canChannels, readOnly}: {notifications: Tables<'notifications'>[]; unread: number; channels: Channel[]; sites: Site[]; canChannels: boolean; readOnly: boolean}) {
  const t = useTranslations('Phase7');
  const messages = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [signingSecret, setSigningSecret] = useState('');
  async function run(action: () => Promise<{ok: boolean; data?: object; error?: {message: string}}>) {
    setBusy(true); setMessage(''); const result = await action(); setBusy(false);
    if (result.ok) {setMessage(t('saved')); if (result.data && 'signingSecret' in result.data && typeof result.data.signingSecret === 'string') setSigningSecret(result.data.signingSecret); router.refresh();}
    else setMessage(result.error?.message ?? t('actionFailed'));
  }
  async function addChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const target = event.currentTarget; const form = new FormData(target);
    await run(() => addChannelAction({name: String(form.get('name') ?? ''), type: String(form.get('type') ?? ''), url: String(form.get('url') ?? ''),
      siteId: String(form.get('siteId') ?? '') || undefined}));
    target.reset();
  }
  const label = (key: string, fallback: string) => messages.has(key as Parameters<typeof messages.has>[0]) ? messages(key as Parameters<typeof messages>[0]) : fallback;
  return <div className="space-y-6"><section className="rounded-xl border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{t('inbox')} <span className="text-sm text-muted-foreground">({unread} {t('unread')})</span></h2>{unread > 0 && <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => markAllNotificationsReadAction({}))}>{t('markAllRead')}</Button>}</div>
      {notifications.length ? <ul className="mt-4 divide-y">{notifications.map((item) => <li key={item.id} className={`flex flex-wrap items-start justify-between gap-3 py-4 ${item.read_at ? 'opacity-70' : ''}`}><div><strong className="text-sm">{label(item.title_key, t(`notificationType.${item.type}`))}</strong><p className="mt-1 text-sm text-muted-foreground">{label(item.body_key, '')}</p><p className="mt-2 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString(locale)}</p>{item.site_id && <Link href={`/dashboard/sites/${item.site_id}`} className="mt-2 inline-block text-xs font-medium text-primary underline">{t('viewSite')}</Link>}</div>{!item.read_at && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => markNotificationsReadAction({ids: [item.id]}))}>{t('markRead')}</Button>}</li>)}</ul> : <p className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t('emptyInbox')}</p>}
    </section><section className="rounded-xl border bg-card p-5"><h2 className="text-xl font-semibold">{t('alertChannels')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('alertChannelsDescription')}</p>{canChannels && !readOnly ? <form onSubmit={addChannel} className="mt-4 grid gap-3 sm:grid-cols-2"><Input name="name" maxLength={120} placeholder={t('channelName')} aria-label={t('channelName')} required /><select name="type" aria-label={t('channelType')} className="rounded-md border bg-background px-3 py-2 text-sm"><option value="slack">Slack</option><option value="discord">Discord</option><option value="webhook">Webhook</option></select><Input name="url" type="url" autoComplete="off" maxLength={2048} placeholder={t('channelUrl')} aria-label={t('channelUrl')} required /><select name="siteId" aria-label={t('channelSite')} className="rounded-md border bg-background px-3 py-2 text-sm"><option value="">{t('allSites')}</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select><Button className="sm:col-span-2" disabled={busy}>{t('addChannel')}</Button></form> : <p className="mt-4 text-sm">{t('channelUpgrade')} <Link href="/dashboard/billing" className="font-medium text-primary underline">{t('upgrade')}</Link></p>}
      {signingSecret && <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4"><p className="text-sm font-medium">{t('signingSecretOnce')}</p><code className="mt-2 block break-all text-xs">{signingSecret}</code><Button className="mt-3" variant="outline" onClick={() => navigator.clipboard.writeText(signingSecret)}>{t('copy')}</Button></div>}
      {channels.length ? <ul className="mt-5 divide-y">{channels.map((channel) => <li key={channel.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><strong>{channel.name}</strong><span className="ml-2 text-muted-foreground">{channel.type} · {channel.enabled ? t('active') : t('disabled')}</span>{channel.last_error_code && <p className="text-xs text-destructive">{t('deliveryIssue')}</p>}</div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy || !canChannels || readOnly} onClick={() => run(() => toggleChannelAction({id: channel.id, enabled: !channel.enabled}))}>{channel.enabled ? t('disable') : t('enable')}</Button><Button size="sm" variant="outline" disabled={busy || readOnly} onClick={() => run(() => removeChannelAction({id: channel.id}))}>{t('remove')}</Button></div></li>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">{t('noChannels')}</p>}
    </section>{message && <p role="status" className="text-sm">{message}</p>}</div>;
}
