import type {Locale} from '@/i18n/routing';
import {LegalContent, legalMetadata} from '@/lib/marketing/legal-page';

type Props = {params: Promise<{locale: Locale}>};

export async function generateMetadata({params}: Props) {
  return legalMetadata((await params).locale, 'terms');
}

export default async function TermsPage({params}: Props) {
  return <LegalContent locale={(await params).locale} document="terms" />;
}
