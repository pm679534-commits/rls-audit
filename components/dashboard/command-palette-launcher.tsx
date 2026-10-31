'use client';

import {useEffect, useState} from 'react';
import dynamic from 'next/dynamic';
import {Search} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {Button} from '@/components/ui/button';

const Palette = dynamic(() => import('./command-palette').then((module) => module.CommandPaletteDialog), {ssr: false});

export function CommandPaletteLauncher({sites}: {sites: {id: string; name: string; domain: string}[]}) {
  const t = useTranslations('Phase7');
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {event.preventDefault(); setLoaded(true); setOpen((value) => !value);}
      if (event.key === '/' && !open && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {event.preventDefault(); setLoaded(true); setOpen(true);}
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open]);
  return <><Button type="button" variant="outline" size="sm" onClick={() => {setLoaded(true); setOpen(true);}} aria-label={t('searchAll')} className="min-h-11 gap-2"><Search className="size-4" /><span className="hidden sm:inline">{t('searchAll')}</span><kbd className="hidden rounded border px-1 text-xs text-muted-foreground sm:inline">⌘K</kbd></Button>
    {loaded && <Palette sites={sites} open={open} onOpenChange={setOpen} />}
  </>;
}
