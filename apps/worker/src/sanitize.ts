/** Cleaning data on its way into Postgres and out to the public. */
import { stripNul, LIMITS, type GatheredData } from '@site-scanner/core';

export const clean = stripNul;

/** Errors shown publicly on /r/:id: never leak driver or filesystem detail. */
export function publicError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/^Scan exceeded|^Analysis took too long/.test(m)) return m;
  return 'The scan could not be completed. Please try again.';
}

/** Keep stored raw data useful for re-analysis but bounded: cap bodies, drop script contents we no longer need. */
export function stripForStorage(d: GatheredData): GatheredData {
  const copy: GatheredData = clean(d);
  if (copy.http?.final && copy.http.final.body.length > LIMITS.maxHtmlBytes) copy.http.final.body = copy.http.final.body.slice(0, LIMITS.maxHtmlBytes);
  if (copy.browser && copy.browser.renderedHtml.length > LIMITS.maxHtmlBytes) copy.browser.renderedHtml = copy.browser.renderedHtml.slice(0, LIMITS.maxHtmlBytes);
  if (copy.files) for (const f of copy.files.scripts) if (f.body && f.body.length > 20_000) f.body = f.body.slice(0, 20_000);
  if (copy.external?.psi?.screenshotDataUrl && copy.browser?.screenshot) copy.external.psi.screenshotDataUrl = null;
  return copy;
}
