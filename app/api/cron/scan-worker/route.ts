import {randomUUID} from 'node:crypto';
import {cronEndpoint} from '@/lib/cron';
import {claimAndProcessJobs, recoverStuckJobs} from '@/lib/scanner/service';
import {isSystemFeatureEnabled} from '@/lib/system/config';

export const runtime = 'nodejs';
export const maxDuration = 90;
export async function GET(request: Request) {
  return cronEndpoint(request, async () => {
    const recovered = await recoverStuckJobs();
    if (!await isSystemFeatureEnabled('automatic_scans')) return {recovered, claimed: 0, processed: 0, disabled: true};
    return {recovered, ...await claimAndProcessJobs(`cron:${randomUUID()}`, 2)};
  });
}
