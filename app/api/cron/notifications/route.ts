import {cronEndpoint} from '@/lib/cron';
import {dispatchNotifications} from '@/lib/notifications/dispatch';

export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) { return cronEndpoint(request, () => dispatchNotifications(5)); }
