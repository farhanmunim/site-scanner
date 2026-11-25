/**
 * Version comparison shared by the WordPress and retire.js matchers.
 * Numeric parts compare numerically; a pre-release tag ("1.0.0-beta1", "2.0.0rc1", "1.2.3a")
 * sorts before the plain release; two tags compare naturally.
 */
function parse(v: string): { nums: number[]; pre: string } {
  const m = /^v?(\d+(?:\.\d+)*)(.*)$/.exec(v.trim());
  if (!m) return { nums: [], pre: v.trim() };
  return { nums: m[1]!.split('.').map(Number), pre: m[2]!.replace(/^[-_.+]+/, '') };
}

export function compareVersions(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.nums.length, pb.nums.length); i++) {
    const d = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (d !== 0) return d;
  }
  if (pa.pre === pb.pre) return 0;
  if (!pa.pre) return 1;
  if (!pb.pre) return -1;
  return pa.pre.localeCompare(pb.pre, 'en', { numeric: true });
}
