/**
 * Postgres jsonb rejects U+0000. Strip real NUL characters from every string (and key), leaving the two-character
 * text "\u0000" that appears in JavaScript source alone: editing serialised JSON would corrupt that.
 */
export function stripNul<T>(v: T): T {
  const NUL = String.fromCharCode(0);
  const walk = (x: unknown): unknown => {
    if (typeof x === 'string') return x.includes(NUL) ? x.replaceAll(NUL, '') : x;
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, val]) => [k.includes(NUL) ? k.replaceAll(NUL, '') : k, walk(val)]));
    return x;
  };
  return walk(v) as T;
}
