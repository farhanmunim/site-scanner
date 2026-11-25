/** Small shared fetch helper for the public lookups. */

export async function getWithRetry(f: typeof fetch, url: string, timeoutMs: number, tries: number): Promise<Response | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await f(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return res;
      // Rate limited or overloaded: another attempt rarely helps for 4xx, often does for 5xx.
      if (res.status < 500) return null;
    } catch {
      /* timeout or network error: retry */
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}
