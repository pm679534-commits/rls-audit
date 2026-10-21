import {getServerEnv} from '@/lib/env';

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    getServerEnv();
  }
}
