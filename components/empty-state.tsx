import {ShieldQuestion} from 'lucide-react';
import {cn} from '@/lib/utils';

export function EmptyState({title, description, action, icon: Icon = ShieldQuestion, className}: {title: string; description?: string; action?: React.ReactNode; icon?: typeof ShieldQuestion; className?: string}) {
  return <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-14 text-center', className)}>
    <span className="mb-5 flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground"><Icon className="size-6" aria-hidden="true" /></span>
    <h2 className="text-lg font-semibold">{title}</h2>{description && <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>}
    {action && <div className="mt-6">{action}</div>}
  </div>;
}
