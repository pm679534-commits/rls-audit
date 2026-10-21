import {getAccountSettings} from '@/lib/account';
import {AccountSettings} from '@/components/account/settings';
import {resolveEntitlements, hasEntitlement} from '@/lib/billing/entitlements';

export default async function SettingsPage() {
  const {context, keys, exports, sessions} = await getAccountSettings();
  const entitlements = await resolveEntitlements(context);
  return <AccountSettings profile={context.profile} keys={keys} exports={exports} sessions={sessions}
    canApi={hasEntitlement(entitlements, 'limitedApi')} fullApi={hasEntitlement(entitlements, 'fullApi')} readOnly={entitlements.read_only} />;
}
