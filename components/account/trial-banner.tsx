import {getTranslations} from 'next-intl/server';
import {getTrialStatus} from '@/lib/auth/trial';
import {Link} from '@/i18n/navigation';
import type {UserContext} from '@/lib/auth';

export async function TrialBanner({context}: {context: UserContext}) {
  const status = await getTrialStatus(context);
  if (!status.active && !status.readOnly) return null;
  const t = await getTranslations('Phase5.trial');
  return <div role="status" className="mb-6 rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 text-sm">
    <strong>{status.readOnly ? t('expiredTitle') : t('activeTitle')}</strong>
    <p className="mt-1 text-muted-foreground">{status.readOnly ? t('expiredBody') : t('daysLeft', {days: status.daysRemaining})}</p>
    {status.readOnly && <UpgradePrompt />}
  </div>;
}

export async function UpgradePrompt() {
  const t = await getTranslations('Phase5.trial');
  return <Link className="mt-3 inline-block font-semibold text-primary underline underline-offset-4" href="/dashboard/billing">{t('upgrade')}</Link>;
}
