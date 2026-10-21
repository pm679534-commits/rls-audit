'use client';

import {useLocale, useTranslations} from 'next-intl';
import {Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';

export function ScoreChart({points}: {points: {date: string; score: number}[]}) {
  const t = useTranslations('Phase7');
  const locale = useLocale();
  if (!points.length) return <div className="grid min-h-56 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">{t('noScoreHistory')}</div>;
  const data = points.map((point) => ({...point, label: new Date(point.date).toLocaleDateString(locale, {month: 'short', day: 'numeric'})}));
  return <><div className="h-64 w-full" role="img" aria-label={t('scoreTrend')}><ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data} margin={{top: 10, right: 8, bottom: 0, left: -28}}><defs><linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} /><YAxis domain={[0, 100]} tickLine={false} axisLine={false} fontSize={11} /><Tooltip contentStyle={{background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8}} /><Area type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#scoreGradient)" isAnimationActive={false} /></AreaChart>
  </ResponsiveContainer></div><table className="sr-only"><caption>{t('scoreTrend')}</caption><thead><tr><th>{t('scan')}</th><th>{t('securityScore')}</th></tr></thead><tbody>{data.map((point, index) => <tr key={`${point.date}:${index}`}><td>{point.label}</td><td>{point.score}</td></tr>)}</tbody></table></>;
}
