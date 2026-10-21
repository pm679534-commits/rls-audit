// Snapshot of upstream Next.js advisories checked on 2026-10-20. A version
// match is a signal to review deployment conditions, not proof of exploitability.
export const NEXT_ADVISORY_SNAPSHOT = '2026-10-20';
export const NEXT_ADVISORIES = [
  {
    id: 'GHSA-f82v-jwr5-mffw',
    url: 'https://github.com/vercel/next.js/security/advisories/GHSA-f82v-jwr5-mffw',
    ranges: [['13.0.0', '13.5.9'], ['14.0.0', '14.2.25'], ['15.0.0', '15.2.3']]
  },
  {
    id: 'GHSA-9qr9-h5gf-34mp',
    url: 'https://github.com/vercel/next.js/security/advisories/GHSA-9qr9-h5gf-34mp',
    ranges: [['15.0.0', '15.0.5'], ['15.1.0', '15.1.9'], ['15.2.0', '15.2.6'], ['15.3.0', '15.3.6'], ['15.4.0', '15.4.8'], ['15.5.0', '15.5.7'], ['16.0.0', '16.0.7']]
  },
  {
    id: 'GHSA-2xp9-vwfh-vxw4',
    url: 'https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4',
    ranges: [['10.0.0', '15.5.24'], ['16.0.0', '16.3.3']]
  },
  {
    id: 'GHSA-vcvr-r3jv-pc5j',
    url: 'https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j',
    ranges: [['16.2.0', '16.3.6']]
  }
] as const;

function tuple(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compare(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export function advisoriesForVersion(version: string): typeof NEXT_ADVISORIES[number][] {
  const parsed = tuple(version);
  if (!parsed) return [];
  return NEXT_ADVISORIES.filter((advisory) => advisory.ranges.some(([from, until]) => {
    const min = tuple(from);
    const max = tuple(until);
    return min && max && compare(parsed, min) >= 0 && compare(parsed, max) < 0;
  }));
}
