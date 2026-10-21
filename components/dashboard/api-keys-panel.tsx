'use client';

import {useState, type FormEvent} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Link} from '@/i18n/navigation';
import {API_SCOPES} from '@/lib/account/scopes';
import {createApiKeyAction, revokeApiKeyAction} from '@/lib/account/actions';

type Key = {id: string; name: string; key_prefix: string; scopes: string[]; revoked_at: string | null; expires_at: string | null; created_at: string};

export function ApiKeysPanel({keys, canApi, fullApi, readOnly}: {keys: Key[]; canApi: boolean; fullApi: boolean; readOnly: boolean}) {
  const t = useTranslations('Phase7');
  const p5 = useTranslations('Phase5.settings');
  const scopes = useTranslations('Phase5Labels.scope');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [newKey, setNewKey] = useState('');
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    setBusy(true); setMessage(''); setNewKey('');
    const result = await createApiKeyAction({name: String(form.get('name') ?? ''), scopes: API_SCOPES.filter((scope) => form.has(scope))});
    setBusy(false);
    if (!result.ok) setMessage(result.error.message);
    else {setNewKey(result.data.key); setMessage(p5('keyCreated')); router.refresh();}
  }
  async function revoke(id: string) {
    setBusy(true); setMessage(''); const result = await revokeApiKeyAction({id}); setBusy(false);
    setMessage(result.ok ? p5('revoked') : result.error.message); if (result.ok) router.refresh();
  }
  return <section className="rounded-xl border bg-card p-5"><h2 className="text-xl font-semibold">{p5('apiKeys')}</h2><p className="mt-1 text-sm text-muted-foreground">{p5('keyOnce')}</p>{canApi && !readOnly ? <form onSubmit={create} className="mt-4 space-y-3"><Input name="name" placeholder={p5('keyName')} aria-label={p5('keyName')} maxLength={120} required /><fieldset><legend className="text-sm font-medium">{t('apiScopes')}</legend><div className="mt-2 flex flex-wrap gap-3">{API_SCOPES.filter((scope) => fullApi || !['exports:read','ci:write'].includes(scope)).map((scope) => <label key={scope} className="flex items-center gap-2 text-sm"><input type="checkbox" name={scope} defaultChecked={scope === 'sites:read' || scope === 'scans:read'} />{scopes(scope)}</label>)}</div></fieldset><Button disabled={busy}>{p5('createKey')}</Button></form> : <p className="mt-4 text-sm">{t('apiUpgrade')} <Link href="/dashboard/billing" className="font-medium text-primary underline">{t('upgrade')}</Link></p>}
    {newKey && <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4"><strong className="text-sm">{p5('copyNow')}</strong><code className="mt-2 block break-all text-xs select-all">{newKey}</code><Button className="mt-3" variant="outline" onClick={() => navigator.clipboard.writeText(newKey)}>{t('copy')}</Button></div>}
    {keys.length ? <ul className="mt-5 divide-y">{keys.map((key) => <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><strong>{key.name}</strong><p className="mt-1 text-xs text-muted-foreground">sg_{key.key_prefix}_… · {key.scopes.join(', ')} · {key.revoked_at ? p5('revoked') : p5('active')}</p></div>{!key.revoked_at && !readOnly && <Button size="sm" variant="outline" disabled={busy} onClick={() => revoke(key.id)}>{p5('revoke')}</Button>}</li>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">{t('noApiKeys')}</p>}
    {message && <p role="status" className="mt-4 text-sm">{message}</p>}
  </section>;
}
