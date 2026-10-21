import {cn} from '@/lib/utils';

export function ScoreRing({score, label, size = 120, className}: {score: number | null; label: string; size?: number; className?: string}) {
  const normalized = score === null ? 0 : Math.max(0, Math.min(100, score));
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const stroke = score === null ? 'text-muted-foreground' : normalized >= 80 ? 'text-success' : normalized >= 50 ? 'text-warning' : 'text-destructive';
  return <div className={cn('relative inline-grid place-items-center', className)} style={{width: size, height: size}} role="img" aria-label={`${label}: ${score ?? '—'}/100`}>
    <svg viewBox="0 0 120 120" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
      <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" className={stroke} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - normalized / 100)} />
    </svg><span className="text-3xl font-semibold tabular-nums">{score ?? '—'}</span>
  </div>;
}
