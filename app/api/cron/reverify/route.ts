import {cronEndpoint} from '@/lib/cron';
import {recheckDueVerifications} from '@/lib/sites';

export const runtime = 'nodejs';
export const maxDuration = 90;
export async function GET(request: Request) { return cronEndpoint(request, () => recheckDueVerifications(5)); }
