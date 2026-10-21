import {cronEndpoint} from '@/lib/cron';
import {processExports} from '@/lib/exports/worker';

export const runtime = 'nodejs';
export const maxDuration = 300;
export async function GET(request: Request) { return cronEndpoint(request, () => processExports(1)); }
