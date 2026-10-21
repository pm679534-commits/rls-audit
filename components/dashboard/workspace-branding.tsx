'use client';

import {useState, type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {Button} from '@/components/ui/button';
import {setWorkspaceBrandAction} from '@/lib/team/actions';
import type {Tables} from '@/types/database';

type Workspace = Pick<Tables<'client_workspaces'>, 'id' | 'name' | 'client_name' | 'brand_color' | 'logo_path'>;
export function WorkspaceBranding({teamId, workspaces}: {teamId: string; workspaces: Workspace[]}) {
  const t = useTranslations('Phase9.brand');
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  async function perform(workspaceId: string, color: string, logo: File | null, removeLogo: boolean) {
    setBusy(workspaceId); setMessage('');
    const result = await setWorkspaceBrandAction({teamId, workspaceId, color, logo, removeLogo});
    setBusy(null);
    setMessage(result.ok ? t('saved') : result.error.message);
    if (result.ok) router.refresh();
  }
  async function save(event: FormEvent<HTMLFormElement>, workspaceId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('logo');
    await perform(workspaceId, String(form.get('color') ?? '#117d78'), file instanceof File && file.size > 0 ? file : null, false);
  }
  return <section className="rounded-xl border bg-card p-5"><h2 className="text-xl font-semibold">{t('title')}</h2><p className="mt-2 text-sm text-muted-foreground">{t('description')}</p>
    <div className="mt-5 grid gap-5 md:grid-cols-2">{workspaces.map((workspace) => <form key={workspace.id} className="space-y-4 rounded-xl border p-4" onSubmit={(event) => save(event, workspace.id)}>
      <div><h3 className="font-semibold">{workspace.name}</h3><p className="text-xs text-muted-foreground">{workspace.client_name || workspace.name}</p></div>
      {workspace.logo_path && <div className="flex items-center gap-3"><img src={`/api/team/logo/${workspace.id}`} alt={t('logoAlt', {name: workspace.name})} className="h-14 max-w-32 object-contain" /><Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => perform(workspace.id, workspace.brand_color || '#117d78', null, true)}>{t('removeLogo')}</Button></div>}
      <label className="block text-sm font-medium">{t('color')}<input name="color" type="color" defaultValue={workspace.brand_color || '#117d78'} className="ml-3 h-9 w-14 align-middle" /></label>
      <label className="block text-sm font-medium">{t('logo')}<input name="logo" type="file" accept="image/png,image/jpeg" className="mt-2 block w-full text-sm" /></label>
      <p className="text-xs text-muted-foreground">{t('logoHelp')}</p><Button disabled={busy !== null}>{busy === workspace.id ? t('saving') : t('save')}</Button>
    </form>)}</div>{message && <p role="status" className="mt-4 text-sm">{message}</p>}
  </section>;
}
