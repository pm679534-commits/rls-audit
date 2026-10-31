import {getTranslations} from 'next-intl/server';
import {Activity, CreditCard, UserRoundPlus, AlertTriangle, ListTodo, TrendingDown} from 'lucide-react';
import {requireAdmin} from '@/lib/auth';
import {adminOverview} from '@/lib/admin/data';
import {AdminMetricsChartLazy as AdminMetricsChart} from '@/components/admin/metrics-chart-lazy';
import {AdminHeading, AdminSection} from '@/components/admin/primitives';
import {StatCard} from '@/components/stat-card';

export default async function AdminOverviewPage() {
  await requireAdmin();
  const [data,t] = await Promise.all([adminOverview(), getTranslations('Phase8')]);
  return <div className="space-y-6"><AdminHeading eyebrow={t('panel')} title={t('dashboard.title')} description={t('dashboard.description')} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><StatCard label={t('dashboard.mrr')} value={`€${data.mrr.toLocaleString()}`} icon={CreditCard} /><StatCard label={t('dashboard.signups')} value={data.signups} icon={UserRoundPlus} /><StatCard label={t('dashboard.trialsStarted')} value={data.trialsStarted} icon={Activity} /><StatCard label={t('dashboard.trialsConverted')} value={data.trialsConverted} icon={CreditCard} /><StatCard label={t('dashboard.churned')} value={data.churned} icon={TrendingDown} /><StatCard label={t('dashboard.queueDepth')} value={data.queueDepth} icon={ListTodo} /><StatCard label={t('dashboard.failureRate')} value={`${data.failureRate}%`} icon={AlertTriangle} /><StatCard label={t('dashboard.runningJobs')} value={data.runningJobs} icon={Activity} /></div>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]"><AdminSection title={t('dashboard.dailyActivity')}><AdminMetricsChart points={data.daily} signups={t('dashboard.signups')} scans={t('dashboard.scans')} failed={t('dashboard.failed')} /></AdminSection><AdminSection title={t('dashboard.activeByPlan')}><div className="space-y-3">{(['starter','pro','agency'] as const).map((plan) => <div key={plan} className="flex items-center justify-between border-b pb-3 text-sm last:border-0"><span className="font-medium">{t(`plan.${plan}`)}</span><strong>{data.active[plan]}</strong></div>)}</div><p className="mt-5 text-xs text-muted-foreground">{t('dashboard.mrrNote')}</p></AdminSection></div>
  </div>;
}
