import {getSiteUrl} from '@/lib/config';

export const runtime = 'nodejs';
const error = {type: 'object', required: ['error'], properties: {error: {type: 'object', required: ['code','message'], properties: {code: {type: 'string'}, message: {type: 'string'}}}}};
const responses = {400: {description: 'Invalid input', content: {'application/json': {schema: error}}},
  401: {description: 'Missing or invalid API key', content: {'application/json': {schema: error}}},
  403: {description: 'Insufficient scope or plan', content: {'application/json': {schema: error}}},
  404: {description: 'Resource not found', content: {'application/json': {schema: error}}},
  429: {description: 'Rate limit exceeded', content: {'application/json': {schema: error}}},
  500: {description: 'Internal error', content: {'application/json': {schema: error}}}};
const operation = (summary: string, scope: string, success = 200) => ({summary, security: [{apiKey: []}],
  'x-required-scope': scope, responses: {...responses, [success]: {description: 'Success', content: {'application/json': {schema: {type: 'object'}}}}}});
const uuid = {name: 'siteId', in: 'path', required: true, schema: {type: 'string', format: 'uuid'}};
const scanId = {...uuid, name: 'scanId'};
const exportId = {...uuid, name: 'id'};
export async function GET() {
  const document = {openapi: '3.1.0', info: {title: 'SiteGuard API', version: '1.0.0', description: 'Versioned API for verified site scans. Pro keys provide limited access; Agency keys enable exports and CI.'},
    servers: [{url: getSiteUrl().origin}], components: {securitySchemes: {apiKey: {type: 'http', scheme: 'bearer', bearerFormat: 'SiteGuard API key'}}, schemas: {
      Error: error, Site: {type: 'object', properties: {id: {type: 'string', format: 'uuid'}, name: {type: 'string'}, domain: {type: 'string'}, last_score: {type: ['integer','null']}}}}},
    paths: {
      '/api/v1/sites': {get: {...operation('List owned sites', 'sites:read'), parameters: [{name: 'limit', in: 'query', schema: {type: 'integer', minimum: 1, maximum: 100}}, {name: 'cursor', in: 'query', schema: {type: 'string', format: 'uuid'}}]}},
      '/api/v1/sites/{siteId}/scans': {post: {...operation('Queue a verified site scan', 'scans:write', 202), parameters: [uuid], requestBody: {content: {'application/json': {schema: {type: 'object', properties: {idempotencyKey: {type: 'string', minLength: 8, maxLength: 200}}}}}}}},
      '/api/v1/scans/{scanId}': {get: {...operation('Get scan status and score', 'scans:read'), parameters: [scanId]}},
      '/api/v1/scans/{scanId}/findings': {get: {...operation('List scan findings without sensitive evidence', 'scans:read'), parameters: [scanId, {name: 'severity', in: 'query', schema: {type: 'string', enum: ['critical','high','medium','low','info']}}, {name: 'limit', in: 'query', schema: {type: 'integer', minimum: 1, maximum: 100}}, {name: 'offset', in: 'query', schema: {type: 'integer', minimum: 0}}]}},
      '/api/v1/sites/{siteId}/score': {get: {...operation('Get current score and score history', 'sites:read'), parameters: [uuid]}},
      '/api/v1/exports': {post: {...operation('Queue a report export (Agency)', 'exports:read', 202), requestBody: {required: true, content: {'application/json': {schema: {type: 'object', required: ['scanId','format'], properties: {scanId: {type: 'string', format: 'uuid'}, format: {type: 'string', enum: ['pdf','csv','json']}}}}}}}},
      '/api/v1/exports/{id}': {get: {...operation('Get export status or download with ?download=1 (Agency)', 'exports:read'), parameters: [exportId, {name: 'download', in: 'query', schema: {type: 'boolean'}}]}},
      '/api/v1/ci': {post: {...operation('Enforce scan score and critical finding thresholds (Agency)', 'ci:write'), requestBody: {required: true, content: {'application/json': {schema: {type: 'object', required: ['siteId'], properties: {siteId: {type: 'string', format: 'uuid'}, minScore: {type: 'integer', minimum: 0, maximum: 100, default: 80}, maxCritical: {type: 'integer', minimum: 0, maximum: 100, default: 0}}}}}}, responses: {...responses, 200: {description: 'Thresholds passed'}, 422: {description: 'Thresholds failed'}}}}
    }};
  return Response.json(document, {headers: {'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*'}});
}
