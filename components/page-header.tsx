import {cn} from '@/lib/utils';

export function PageHeader({eyebrow, title, description, actions, className}: {eyebrow?: string; title: string; description?: string; actions?: React.ReactNode; className?: string}) {
  return <header className={cn('flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between', className)}>
    <div className="max-w-2xl space-y-2">{eyebrow && <p className="text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground">{eyebrow}</p>}<h1 className="font-display text-3xl tracking-tight sm:text-4xl">{title}</h1>{description && <p className="text-muted-foreground">{description}</p>}</div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>;
}
