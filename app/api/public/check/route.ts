import {NextResponse} from 'next/server';
import {checkPublicSite} from '@/lib/scanner/public';
import {toRouteError, ValidationError} from '@/lib/errors';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length') ?? 0) > 8192) return NextResponse.json({error: {code: 'INVALID_INPUT'}}, {status: 413});
    const reader = request.body?.getReader();
    if (!reader) throw new ValidationError();
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8192) {
          await reader.cancel();
          return NextResponse.json({error: {code: 'INVALID_INPUT'}}, {status: 413});
        }
        chunks.push(value);
      }
    } finally {reader.releaseLock();}
    let input: unknown;
    try {
      const body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {body.set(chunk, offset); offset += chunk.byteLength;}
      input = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(body));
    } catch {throw new ValidationError();}
    const result = await checkPublicSite(input, request);
    return NextResponse.json({domain: result.domain, score: result.score,
      findings: result.findings.map(({id, severity, titleKey}) => ({id, severity, titleKey}))},
    {headers: {'Cache-Control': 'no-store', ...Object.fromEntries(result.headers.entries())}});
  } catch (error) {
    return toRouteError(error, {'Cache-Control': 'no-store'});
  }
}
