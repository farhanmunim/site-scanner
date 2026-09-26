import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, desc, inArray, scans } from '@site-scanner/db';
import type { Report } from '@site-scanner/core/types';
import { requestScan } from '$lib/server/scan-service.js';
import { getDb } from '$lib/server/db.js';
import { withScores } from '$lib/server/report-compat.js';

const EXAMPLES = ['wikipedia.org', 'github.com', 'bbc.co.uk', 'shopify.com'];

interface Sample {
  id: string;
  host: string;
  grade: string;
  overall: number;
  summary: string;
  fixes: { title: string; where: string }[];
  stack: string[];
  scannedAt: string;
}

/** The most recent complete report for one of the example sites, as a compact excerpt. */
async function sample(): Promise<Sample | null> {
  try {
    const rows = await getDb()
      .select({ id: scans.id, host: scans.displayHost, report: scans.report, createdAt: scans.createdAt })
      .from(scans)
      .where(and(inArray(scans.registrableDomain, EXAMPLES), inArray(scans.status, ['complete', 'partial'])))
      .orderBy(desc(scans.createdAt))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const r = withScores(row).report as Report | null;
    if (!r?.scores || r.scores.overall === null || !r.scores.grade) return null;
    const fixes = r.scores.sections.flatMap((s) => s.penalties.map((p) => ({ title: p.title, where: s.label, points: p.points }))).sort((a, b) => b.points - a.points).slice(0, 2);
    const stack = r.technologies.filter((t) => !t.implied && t.confidence !== 'low').slice(0, 6).map((t) => t.name);
    return { id: row.id, host: row.host, grade: r.scores.grade, overall: r.scores.overall, summary: r.scores.summary, fixes: fixes.map(({ title, where }) => ({ title, where })), stack, scannedAt: row.createdAt.toISOString() };
  } catch {
    return null;
  }
}

/** `/?url=example.com` prefills the form (used by "scan another site" links). */
export const load: PageServerLoad = async ({ url }) => ({ prefill: url.searchParams.get('url')?.slice(0, 2048) ?? '', sample: await sample(), examples: EXAMPLES });

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const form = await request.formData();
    const input = String(form.get('url') ?? '').trim();
    if (!input) return fail(400, { error: 'Enter a website address.', input });
    const result = await requestScan({
      input,
      ip: locals.clientIp,
      country: locals.country,
      userAgent: request.headers.get('user-agent'),
      referrer: request.headers.get('referer'),
      turnstileToken: String(form.get('cf-turnstile-response') ?? '') || null,
      source: 'web'
    });
    if (!result.ok) return fail(result.status, { error: result.error, input });
    redirect(303, `/r/${result.scanId}${result.notice ? `?notice=${encodeURIComponent(result.notice)}` : ''}`);
  }
};
