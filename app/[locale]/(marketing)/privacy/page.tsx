import type {Locale} from '@/i18n/routing';
import {LegalContent, legalMetadata} from '@/lib/marketing/legal-page';

type Props = {params: Promise<{locale: Locale}>};

export async function generateMetadata({params}: Props) {
  return legalMetadata((await params).locale, 'privacy');
}

export default async function PrivacyPage({params}: Props) {
  return <LegalContent locale={(await params).locale} document="privacy" />;
}
