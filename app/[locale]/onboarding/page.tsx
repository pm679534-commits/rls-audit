import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {requirePageUser} from '@/lib/auth/page';
import {createClient} from '@/lib/supabase/server';
import {Link} from '@/i18n/navigation';
import {SiteForm, FirstScanButton, VerificationControls} from '@/components/sites/site-manager';
import {getTrialStatus} from '@/lib/auth/trial';
import {UpgradePrompt} from '@/components/account/trial-banner';

export default async function OnboardingPage() {
  const context = await requirePageUser();
  const db = await createClient();
  const {data: sites} = await db.from('sites').select('*').eq('owner_id', context.user.id).order('created_at', {ascending: true}).limit(1);
  const site = sites?.[0];
  const t = await getTranslations('Phase5.onboarding');
  const trial = await getTrialStatus(context);
  const trialText = await getTranslations('Phase5.trial');
  if (site) {
    const {count} = await db.from('scans').select('id', {head: true, count: 'exact'}).eq('site_id', site.id);
    if (site.verified_at && count) redirect(`/${context.profile.locale}/dashboard`);
  }
  const {data: challenges} = site ? await db.from('site_verifications').select('*').eq('site_id', site.id).eq('status', 'pending').order('created_at', {ascending: false}).limit(1) : {data: null};
  return <main className="container max-w-3xl space-y-8 py-12">
    <div><p className="text-sm font-semibold text-primary">{t('eyebrow')}</p><h1 className="mt-2 font-display text-4xl">{t('title')}</h1><p className="mt-3 text-muted-foreground">{t('description')}</p></div>
    <ol className="grid gap-2 text-sm sm:grid-cols-4"><li className="rounded-lg border bg-card p-3">1. {t('welcome')}</li><li className="rounded-lg border bg-card p-3">2. {t('addSite')}</li><li className="rounded-lg border bg-card p-3">3. {t('verify')}</li><li className="rounded-lg border bg-card p-3">4. {t('firstScan')}</li></ol>
    {trial.readOnly ? <section className="rounded-xl border bg-card p-5"><h2 className="text-xl font-semibold">{trialText('expiredTitle')}</h2><p className="mt-2 text-muted-foreground">{trialText('expiredBody')}</p><UpgradePrompt /></section> : !site ? <SiteForm /> : !site.verified_at ? <VerificationControls site={site} challenge={challenges?.[0] ?? null} /> : <section className="space-y-4 rounded-xl border bg-card p-5"><h2 className="text-xl font-semibold">{t('ready')}</h2><FirstScanButton siteId={site.id} /></section>}
    <Link href="/dashboard" className="inline-block text-sm text-primary underline underline-offset-4">{t('dashboard')}</Link>
  </main>;
}
