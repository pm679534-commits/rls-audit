import type {Finding} from './types';
import {FINDING_REGISTRY} from './registry';

export const SCORING_MODEL = {
  startingScore: 100,
  minimumScore: 0,
  repeatedFindingDecay: 0.55,
  rounding: 'nearest-integer'
} as const;

// Findings are grouped by definition. The first occurrence costs its full
// weight, then each additional affected asset costs 55% of the previous one.
// This keeps a widespread issue serious without letting duplicates dominate.
// Sorting fingerprints makes the calculation deterministic across scan order.
export function calculateScore(findings: readonly Finding[]): number {
  const unique = [...new Map(findings.map((item) => [item.fingerprint, item])).values()];
  const groups = new Map<string, Finding[]>();
  for (const finding of unique) groups.set(finding.id, [...(groups.get(finding.id) ?? []), finding]);
  let penalty = 0;
  for (const [id, group] of groups) {
    const definition = FINDING_REGISTRY[id as keyof typeof FINDING_REGISTRY];
    if (!definition) continue;
    group.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
    for (let index = 0; index < group.length; index++) penalty += definition.scoreWeight * SCORING_MODEL.repeatedFindingDecay ** index;
  }
  return Math.max(SCORING_MODEL.minimumScore, Math.round(SCORING_MODEL.startingScore - penalty));
}
