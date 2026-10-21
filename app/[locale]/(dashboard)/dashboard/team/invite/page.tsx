import {notFound} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {previewInvite} from '@/lib/team';
import {InviteAcceptance} from '@/components/dashboard/invite-acceptance';

export default async function InvitePage({searchParams}: {searchParams: Promise<{token?: string}>}) {
  const {token} = await searchParams;
  if (!token) notFound();
  let preview;
  try { preview = await previewInvite(token); } catch { notFound(); }
  const t = await getTranslations('Phase7');
  return <div className="mx-auto max-w-lg rounded-xl border bg-card p-8"><h1 className="font-display text-3xl">{t('teamInvitation')}</h1><p className="mt-3 text-muted-foreground">{t('invitedToTeam', {team: preview.team.name})}</p><p className="mt-2 text-sm">{t('inviteRole')}: {t(`teamRole.${preview.invite.role}`)}</p><InviteAcceptance token={token} /></div>;
}
