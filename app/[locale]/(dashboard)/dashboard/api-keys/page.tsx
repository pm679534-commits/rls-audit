import {getTranslations} from 'next-intl/server';
import {getAccountSettings} from '@/lib/account';
import {resolveEntitlements, hasEntitlement} from '@/lib/billing/entitlements';
import {ApiKeysPanel} from '@/components/dashboard/api-keys-panel';

export default async function ApiKeysPage() {
  const settings = await getAccountSettings();
  const entitlements = await resolveEntitlements(settings.context);
  const t = await getTranslations('Phase7');
  return <div className="space-y-6"><div><h1 className="font-display text-3xl">{t('apiKeys')}</h1><p className="mt-2 text-muted-foreground">{t('apiKeysDescription')}</p></div>
    <ApiKeysPanel keys={settings.keys} canApi={hasEntitlement(entitlements, 'limitedApi')} fullApi={hasEntitlement(entitlements, 'fullApi')} readOnly={entitlements.read_only} />
  </div>;
}
