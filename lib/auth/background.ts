import 'server-only';

import {after} from 'next/server';
import {logUnexpectedError} from '@/lib/logger';

// Work scheduled here is deliberately nonessential to the response. Vercel waits
// for after() callbacks, so each callback has a bounded lifetime.
export function afterAuthResponse(label: string, task: () => Promise<unknown>): void {
  after(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        task(),
        new Promise<never>((_, reject) => {timer = setTimeout(() => reject(new Error('Background work timed out')), 3000);})
      ]);
    } catch (error) {
      logUnexpectedError(label, error);
    } finally {
      if (timer) clearTimeout(timer);
    }
  });
}
