import {apiEndpoint, json, ownedScan} from '@/lib/api/v1';

export const runtime = 'nodejs';
export async function GET(request: Request, {params}: {params: Promise<{scanId: string}>}) {
  return apiEndpoint(request, 'scans:read', 'scans:read', async (context, headers) => {
    const {scan} = await ownedScan(context, (await params).scanId);
    return json({data: {id: scan.id, siteId: scan.site_id, kind: scan.kind, status: scan.status, score: scan.score,
      summary: scan.summary, failureCode: scan.failure_code, startedAt: scan.started_at, completedAt: scan.completed_at}}, headers);
  });
}
