import 'server-only';

import {getServerEnv} from '@/lib/env';

export function getCompanyDetails() {
  const env = getServerEnv();
  return {
    legalName: env.COMPANY_LEGAL_NAME,
    address: env.COMPANY_ADDRESS,
    email: env.COMPANY_EMAIL,
    registrationNumber: env.COMPANY_REGISTRATION_NUMBER || null,
    vatNumber: env.COMPANY_VAT_NUMBER || null
  };
}
