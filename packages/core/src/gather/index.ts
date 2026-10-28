import { normaliseTarget, TargetError, type NormalisedTarget } from './url.js';
import { checkDenylist, LIMITS, RequestBudget, isRestrictedStatus } from './policy.js';
import { createSafeDispatcher, createSafeFetch } from './node-agent.js';
import { type SafeFetchOptions } from './fetch.js';
import { gatherDns } from './stages/dns.js';
import { gatherHttp } from './stages/http.js';
import { gatherFiles, extractWordPressRefs, extractScriptUrls } from './stages/files.js';
import { gatherRdap } from './stages/rdap.js';
import { gatherTls } from './stages/tls.js';
import { fetchGreenWeb, fetchPsi, fetchSafeBrowsing, fetchSubdomains, fetchWayback, fetchWordPressOrg, fetchWordfence, fetchWordPressLatest, fetchWordPressThemes, fetchRetire, fetchBlocklists, type ExternalConfig } from '../external/index.js';
import type { WordfenceVuln } from '../types.js';
import { checkPropagation } from './stages/propagation.js';
import { SCANNER_VERSION, type BrowserData, type GatheredData, type StageMeta, type StageName } from '../types.js';

export * from './url.js';
export * from './ip.js';
export * from './policy.js';
export * from './doh.js';
export * from './fetch.js';
export * from './node-agent.js';
export { gatherDns, enrichIps } from './stages/dns.js';
export { gatherHttp, detectChallenge } from './stages/http.js';
export { gatherFiles, extractScriptUrls, extractWordPressRefs } from './stages/files.js';
export { gatherRdap } from './stages/rdap.js';
export { gatherTls, type TlsInfo } from './stages/tls.js';
export { gatherCert } from './stages/cert.js';

export interface GatherOptions {
  scanId: string;
  /** Public URL of this scanner (for the User-Agent). */
  selfUrl: string;
  /** Hostnames of this deployment (never scanned). */
  ownHosts?: string[];
  /** IPs of this deployment (never contacted). */
  ownIps?: string[];
  denySuffixes?: string[];
  blockedDomains?: string[];
  fingerprintsVersion?: string | null;
  external?: ExternalConfig;
  /** Called after each stage finishes, with the data so far (for progressive persistence). */
  onStage?: (stage: StageName, data: GatheredData) => Promise<void> | void;
  /** Provided by the worker when a browser is available. */
  browser?: (data: GatheredData, opts: { blockedIps: Set<string>; userAgent: string }) => Promise<BrowserData | null>;
  now?: () => Date;
}

export class ScanRefused extends Error {
  constructor(
    public code: TargetError['code'],
    message: string
  ) {
    super(message);
    this.name = 'ScanRefused';
  }
}

/** Validate + policy-check a user-submitted URL. Throws ScanRefused with a user-facing message. */
export function prepareTarget(input: string, opts: Pick<GatherOptions, 'ownHosts' | 'denySuffixes' | 'blockedDomains'>): NormalisedTarget {
  let t: NormalisedTarget;
  try {
    t = normaliseTarget(input);
  } catch (e) {
    if (e instanceof TargetError) throw new ScanRefused(e.code, e.message);
    throw e;
  }
  const deny = checkDenylist(t.host, { extraSuffixes: opts.denySuffixes, blockedDomains: opts.blockedDomains, ownHosts: opts.ownHosts });
  if (deny.denied) throw new ScanRefused('denied', deny.reason!);
  return t;
}

function stageMeta(status: StageMeta['status'], startedAt: number, note?: string): StageMeta {
  return { status, startedAt: new Date(startedAt).toISOString(), durationMs: Date.now() - startedAt, note };
}

/**
 * Run every gather stage for one target. Stages that fail are recorded as failed and the
 * scan continues — one stage's failure never blanks the report.
 */
export async function gather(target: NormalisedTarget, opts: GatherOptions): Promise<GatheredData> {
  const blockedIps = new Set(opts.ownIps ?? []);
  const dispatcher = createSafeDispatcher({ blockedIps, timeoutMs: LIMITS.requestTimeoutMs });
  const safeFetchImpl = createSafeFetch(dispatcher);
  const budget = new RequestBudget();
  const preResolved = new Map<string, boolean>();

  const data: GatheredData = {
    target: { input: target.input, url: target.url, host: target.host, displayHost: target.displayHost, registrableDomain: target.registrableDomain, isSubdomain: target.isSubdomain },
    scan: { id: opts.scanId, createdAt: new Date().toISOString(), scannerVersion: SCANNER_VERSION, fingerprintsVersion: opts.fingerprintsVersion ?? null },
    stages: { dns: { status: 'pending' }, http: { status: 'pending' }, files: { status: 'pending' }, rdap: { status: 'pending' }, cert: { status: 'pending' }, browser: { status: 'pending' }, external: { status: 'pending' } }
  };
  const done = async (stage: StageName, meta: StageMeta) => {
    data.stages[stage] = meta;
    await opts.onStage?.(stage, data);
  };
  const fetchOpts: SafeFetchOptions = { selfUrl: opts.selfUrl, budget, target: { host: target.host, url: target.url }, blockedIps, fetchImpl: safeFetchImpl, preResolved };

  // DNS, RDAP and TLS are independent of the HTTP fetch; run them alongside it.
  const t0 = Date.now();
  const dnsP = gatherDns(target.host, target.registrableDomain)
    .then(async (r) => {
      data.dns = r.records;
      data.ips = r.ips;
      await done('dns', stageMeta(r.records.A.length || r.records.AAAA.length ? 'complete' : 'failed', t0, r.records.A.length || r.records.AAAA.length ? undefined : 'No address records found'));
    })
    .catch(async (e) => done('dns', stageMeta('failed', t0, String(e?.message ?? e))));
  const rdapP = gatherRdap(target.registrableDomain)
    .then(async (r) => {
      data.rdap = r;
      await done('rdap', stageMeta(r ? 'complete' : 'failed', t0, r ? undefined : 'RDAP lookup unavailable for this TLD'));
    })
    .catch(async (e) => done('rdap', stageMeta('failed', t0, String(e?.message ?? e))));
  const tlsP =
    target.port === 443 || target.port === 8443
      ? gatherTls(target.host, target.port, blockedIps)
          .then(async (r) => {
            data.cert = r;
            await done('cert', stageMeta(r ? 'complete' : 'failed', t0, r ? undefined : 'TLS handshake failed and no CT log entry found'));
          })
          .catch(async (e) => done('cert', stageMeta('failed', t0, String(e?.message ?? e))))
      : done('cert', { status: 'skipped', note: 'Plain-HTTP target' });

  // HTTP → files (files depend on the page).
  const t1 = Date.now();
  const httpP = (async () => {
    try {
      const http = await gatherHttp(target.url, fetchOpts);
      data.http = http;
      if (!http.final) {
        await done('http', stageMeta('failed', t1, http.error ?? 'The site did not respond'));
        await done('files', { status: 'skipped', note: 'No page to analyse' });
        return;
      }
      const restricted = http.challenge || isRestrictedStatus(http.final.status);
      await done('http', stageMeta(restricted ? 'restricted' : 'complete', t1, restricted ? `${http.challenge ? http.challenge.vendor + ' challenge' : 'HTTP ' + http.final.status} — the site restricts automated access` : undefined));
      if (restricted) {
        await done('files', { status: 'skipped', note: 'Skipped: the site restricts automated access' });
        return;
      }
      const t2 = Date.now();
      try {
        data.files = await gatherFiles(http.final.body, http.final.url, fetchOpts);
        await done('files', stageMeta('complete', t2));
      } catch (e) {
        await done('files', stageMeta('failed', t2, String((e as Error)?.message ?? e)));
      }
    } catch (e) {
      await done('http', stageMeta('failed', t1, String((e as Error)?.message ?? e)));
      await done('files', { status: 'skipped' });
    }
  })();

  await Promise.all([dnsP, rdapP, tlsP, httpP]);

  // Browser (optional, provided by the worker). Skipped when restricted.
  const t3 = Date.now();
  if (opts.browser && data.http?.final && data.stages.http.status === 'complete') {
    try {
      const b = await opts.browser(data, { blockedIps, userAgent: `Mozilla/5.0 (compatible; SiteScanBot/1.0; +${opts.selfUrl.replace(/\/$/, '')}/bot)` });
      data.browser = b;
      await done('browser', stageMeta(b ? (b.blocked ? 'restricted' : 'complete') : 'failed', t3, b?.blocked ? `${b.blocked.vendor}: ${b.blocked.evidence}` : b ? undefined : 'Browser rendering failed'));
    } catch (e) {
      await done('browser', stageMeta('failed', t3, String((e as Error)?.message ?? e)));
    }
  } else {
    await done('browser', { status: 'skipped', note: opts.browser ? 'Skipped: page unavailable or restricted' : 'Browser stage not enabled' });
  }

  // External enrichment (free APIs; all optional).
  const t4 = Date.now();
  const ext = opts.external ?? {};
  try {
    const finalUrl = data.http?.final?.url ?? target.url;
    const wp = data.http?.final ? extractWordPressRefs(data.http.final.body) : { detected: false, pluginSlugs: [] as string[], themeSlugs: [] as string[] };
    const wpItems = wp.detected ? [...wp.pluginSlugs.map((slug) => ({ type: 'plugin' as const, slug })), ...wp.themeSlugs.slice(0, 2).map((slug) => ({ type: 'theme' as const, slug })), { type: 'core' as const, slug: 'wordpress' }] : [];
    const scriptUrls = data.http?.final ? [...new Set([...extractScriptUrls(data.http.final.body, finalUrl), ...(data.files?.scripts.map((f) => f.path) ?? []), ...(data.browser?.requests.filter((r) => r.type === 'script').map((r) => r.url) ?? [])])] : [];
    const scriptBodies = (data.files?.scripts ?? []).filter((f) => f.body).map((f) => ({ source: f.path, body: f.body! }));
    const [psi, safeBrowsing, wayback, greenHosting, wordpressOrg, wordfenceVulns, wordpressLatest, wordpressThemes, subdomains, retire, blocklists, propagation] = await Promise.all([
      data.stages.http.status === 'complete' ? fetchPsi(finalUrl, 'mobile', ext) : null,
      fetchSafeBrowsing(finalUrl, ext),
      fetchWayback(target.registrableDomain, ext),
      fetchGreenWeb(target.host, ext),
      wp.detected ? fetchWordPressOrg(wp.pluginSlugs, ext) : {},
      wpItems.length ? fetchWordfence(wpItems, ext) : Promise.resolve({} as Record<string, WordfenceVuln[]>),
      wp.detected ? fetchWordPressLatest(ext) : null,
      wp.detected ? fetchWordPressThemes(wp.themeSlugs, ext) : {},
      fetchSubdomains(target.registrableDomain, ext),
      data.http?.final ? fetchRetire(scriptUrls, scriptBodies, ext).catch(() => null) : null,
      fetchBlocklists(data.dns ?? null, data.ips ?? [], ext).catch(() => null),
      ext.propagation === false ? null : Promise.all([checkPropagation(target.host, { types: ['A', 'AAAA', 'CNAME'] }), checkPropagation(target.registrableDomain, { types: ['MX', 'NS', 'TXT'] })]).then(([a, b]) => ({ ...a, rows: [...a.rows, ...b.rows] })).catch(() => null)
    ]);
    // Summary kept for older readers of `wordfence`: plugin advisory counts regardless of version.
    const wordfence: NonNullable<typeof data.external>['wordfence'] = {};
    for (const [k, list] of Object.entries(wordfenceVulns)) {
      if (!k.startsWith('plugin:') || !list.length) continue;
      wordfence[k.slice(7)] = { count: list.length, latestTitle: list[0]?.title ?? null, affectedBelow: list.flatMap((v) => v.patched).sort().at(-1) ?? null };
    }
    data.external = { psi, safeBrowsing, wayback, greenHosting, wordpressOrg, wordfence, wordfenceVulns, wordpressLatest, wordpressThemes, subdomains, retire, blocklists, propagation };
    await done('external', stageMeta('complete', t4));
  } catch (e) {
    await done('external', stageMeta('failed', t4, String((e as Error)?.message ?? e)));
  }

  await dispatcher.close().catch(() => {});
  return data;
}
