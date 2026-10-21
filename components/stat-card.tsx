import {Card, CardContent} from '@/components/ui/card';

export function StatCard({label, value, detail, icon: Icon}: {label: string; value: string | number; detail?: string; icon?: React.ComponentType<{className?: string; 'aria-hidden'?: boolean}>}) {
  return <Card><CardContent className="flex items-start justify-between gap-4 p-5 sm:p-6"><div className="min-w-0"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>{detail && <p className="mt-2 text-xs text-muted-foreground">{detail}</p>}</div>{Icon && <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-5" aria-hidden /></span>}</CardContent></Card>;
}
