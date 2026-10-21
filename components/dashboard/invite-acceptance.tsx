'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {Button} from '@/components/ui/button';
import {acceptInviteAction} from '@/lib/team/actions';

export function InviteAcceptance({token}: {token: string}) {
  const t = useTranslations('Phase7');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function accept() {
    setBusy(true); setError('');
    const result = await acceptInviteAction({token});
    setBusy(false);
    if (!result.ok) setError(result.error.message);
    else {router.push('/dashboard/team'); router.refresh();}
  }
  return <div className="mt-6"><Button disabled={busy} onClick={accept}>{busy ? t('working') : t('acceptInvite')}</Button>{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}</div>;
}
