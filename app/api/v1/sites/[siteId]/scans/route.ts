import {z} from 'zod';
import {apiEndpoint, json, ownedSite, parseJsonBody} from '@/lib/api/v1';
import {createApiScan} from '@/lib/scanner/service';

export const runtime = 'nodejs';
const input = z.object({idempotencyKey: z.string().min(8).max(200).optional()});
export async function POST(request: Request, {params}: {params: Promise<{siteId: string}>}) {
  return apiEndpoint(request, 'scans:write', 'scans:create', async (context, headers) => {
    const site = await ownedSite(context, (await params).siteId);
    const body = input.parse(await parseJsonBody(request));
    const scan = await createApiScan(request.headers.get('authorization')!.slice(7), site.id, body.idempotencyKey);
    return json({data: {id: scan.id, status: scan.status, siteId: site.id, createdAt: scan.created_at}}, headers, 202);
  });
}
