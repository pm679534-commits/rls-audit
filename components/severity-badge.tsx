'use client';

import {useTranslations} from 'next-intl';
import {cn} from '@/lib/utils';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
const severityClasses: Record<Severity, string> = {
  critical: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
  high: 'border-orange-500/30 bg-orange-500/10 text-orange-800 dark:text-orange-300',
  medium: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  low: 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300',
  info: 'border-border bg-muted text-muted-foreground'
};

export function SeverityBadge({severity}: {severity: Severity}) {
  const t = useTranslations('Dashboard');
  return <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold', severityClasses[severity])}>{t(severity)}</span>;
}
