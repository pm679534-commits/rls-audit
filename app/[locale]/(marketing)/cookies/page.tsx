import type {Locale} from '@/i18n/routing';
import {LegalContent, legalMetadata} from '@/lib/marketing/legal-page';

type Props = {params: Promise<{locale: Locale}>};

export async function generateMetadata({params}: Props) {
  return legalMetadata((await params).locale, 'cookies');
}

export default async function CookiesPage({params}: Props) {
  return <LegalContent locale={(await params).locale} document="cookies" />;
}
