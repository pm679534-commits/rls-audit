import type {Json, Tables} from '@/types/database';
import type {SafeRequestOptions, SafeResponse} from '@/lib/ssrf';
import type {PlanId} from '@/lib/plans';

export type ScanSite = Pick<Tables<'sites'>, 'normalized_url' | 'domain'> & Partial<Pick<Tables<'sites'>, 'id' | 'owner_id' | 'verified_at' | 'verification_due_at'>>;
export type FindingEvidence = Record<string, Json | undefined>;
export type Finding = {
  id: string;
  fingerprint: string;
  affectedAsset: string | null;
  evidence: FindingEvidence;
  metadata?: FindingEvidence;
};
export type ScanContext = {
  site: ScanSite;
  verified: boolean;
  scanId?: string;
  planId?: PlanId;
  state: Json;
  deadlineAt: number;
  http: (url: string, options?: SafeRequestOptions) => Promise<SafeResponse>;
};
export type StepResult = {findings: Finding[]; done: boolean; nextState?: Json; summary?: FindingEvidence};
export type ScanStep = {id: string; verifiedOnly: boolean; timeoutMs: number; run: (context: ScanContext) => Promise<StepResult>};
export type ScanModule = {id: string; name: string; steps: readonly ScanStep[]; run: (context: ScanContext) => Promise<Finding[]>};

export function defineModule(id: string, name: string, steps: readonly ScanStep[]): ScanModule {
  return {
    id, name, steps,
    async run(context) {
      const findings: Finding[] = [];
      for (const step of steps) {
        if (step.verifiedOnly && !context.verified) continue;
        let state: Json = {};
        do {
          const result = await step.run({...context, state});
          findings.push(...result.findings);
          if (result.done) break;
          state = result.nextState ?? {};
        } while (true);
      }
      return findings;
    }
  };
}
