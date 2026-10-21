import {getTranslations} from 'next-intl/server';
import {requireUser} from '@/lib/auth';
import {resolveEntitlements, resolveOwnerEntitlements, hasEntitlement} from '@/lib/billing/entitlements';
import {getTeamDashboard} from '@/lib/team';
import {TeamDashboard} from '@/components/dashboard/team-dashboard';
import {WorkspaceBranding} from '@/components/dashboard/workspace-branding';

export default async function TeamPage({searchParams}: {searchParams: Promise<{team?: string}>}) {
  const context = await requireUser();
  const [data, entitlements] = await Promise.all([getTeamDashboard((await searchParams).team), resolveEntitlements(context)]);
  const ownerEntitlements = data.team ? await resolveOwnerEntitlements(data.team.owner_id) : null;
  const seatLimit = ownerEntitlements?.team_member_limit ?? 0;
  const teamEnabled = !!ownerEntitlements && hasEntitlement(ownerEntitlements, 'team');
  const t = await getTranslations('Phase7');
  return <div className="space-y-6"><div><h1 className="font-display text-3xl">{t('team')}</h1><p className="mt-2 text-muted-foreground">{t('teamDescription')}</p></div>
    <TeamDashboard data={data} canCreate={hasEntitlement(entitlements, 'team')} readOnly={entitlements.read_only || !teamEnabled} teamEnabled={teamEnabled} seatLimit={seatLimit} />
    {data.team && teamEnabled && !entitlements.read_only && data.membership?.role !== 'viewer' && data.workspaces.length > 0 &&
      <WorkspaceBranding teamId={data.team.id} workspaces={data.workspaces} />}
  </div>;
}
