import {Link} from '@/i18n/navigation';

export function AdminHeading({eyebrow, title, description}: {eyebrow: string; title: string; description: string}) {
  return <header className="mb-7"><p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{eyebrow}</p><h1 className="mt-2 font-display text-3xl sm:text-4xl">{title}</h1><p className="mt-2 max-w-3xl text-muted-foreground">{description}</p></header>;
}
export function AdminSection({title, children}: {title: string; children: React.ReactNode}) {
  return <section className="rounded-xl border bg-card p-4 sm:p-6"><h2 className="mb-4 text-lg font-semibold">{title}</h2>{children}</section>;
}
export function AdminEmpty({text}: {text: string}) {return <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">{text}</p>;}
export function AdminPager({path, page, count, label, param = 'page'}: {path: string; page: number; count: number; label: string; param?: string}) {
  const max = Math.ceil(count / 25);
  if (max <= 1) return null;
  return <nav aria-label={label} className="mt-5 flex items-center justify-between gap-3 text-sm"><span>{page} / {max}</span><div className="flex gap-2">{page > 1 && <Link className="rounded-md border px-3 py-2 hover:bg-accent" href={`${path}${path.includes('?') ? '&' : '?'}${param}=${page - 1}`}>←</Link>}{page < max && <Link className="rounded-md border px-3 py-2 hover:bg-accent" href={`${path}${path.includes('?') ? '&' : '?'}${param}=${page + 1}`}>→</Link>}</div></nav>;
}
export function DateText({value, locale}: {value: string | null | undefined; locale: string}) {return value ? <time dateTime={value}>{new Date(value).toLocaleString(locale)}</time> : <span>—</span>;}
