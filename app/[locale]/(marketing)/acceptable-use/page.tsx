import type {Locale} from '@/i18n/routing';
import {LegalContent, legalMetadata} from '@/lib/marketing/legal-page';

type Props = {params: Promise<{locale: Locale}>};

export async function generateMetadata({params}: Props) {
  return legalMetadata((await params).locale, 'acceptable-use');
}

export default async function AcceptableUsePage({params}: Props) {
  return <LegalContent locale={(await params).locale} document="acceptable-use" />;
}
