import type { GatheredData, Report, StageName, TechnologyDetection } from '../types.js';
import { REPORT_VERSION } from '../types.js';
import { parseHtml, type ParsedHtml } from './html.js';
import { detectTechnologies, loadFingerprints, type DetectInput } from './detect/index.js';
import { summariseInfra } from './infra.js';
import { auditSecurityHeaders } from './audits/security.js';
import { auditEmail } from './audits/email.js';
import { analyseRobots, analyseSeo } from './audits/seo.js';
import { summariseThirdParties } from './thirdparties.js';
import { analyseShopify, analyseWordPress } from './wordpress.js';
import { auditPrivacy } from './privacy.js';
import { detectPhp } from './php.js';
import { analyseAiReadiness } from './ai.js';
import { findExposedSecrets } from './secrets.js';
import { auditDomain } from './domain.js';
import { findVulnerableLibraries } from '../external/retire.js';
import { planFor } from '../scope.js';
import type { TlsInfo } from '../gather/stages/tls.js';

export { parseHtml } from './html.js';
export * from './detect/index.js';
export { summariseInfra, ASN_PROVIDERS } from './infra.js';
export { auditSecurityHeaders, gradeCsp } from './audits/security.js';
export { auditEmail } from './audits/email.js';
export { analyseRobots, analyseSeo } from './audits/seo.js';
export { summariseThirdParties, classifyHost } from './thirdparties.js';
export { analyseWordPress, analyseShopify, cmpVer } from './wordpress.js';
export { auditPrivacy } from './privacy.js';
export { detectPhp, PHP_EOL, phpBranch } from './php.js';
export { analyseAiReadiness } from './ai.js';
export { findExposedSecrets } from './secrets.js';
export { auditDomain } from './domain.js';
export { affectsVersion, fixedIn } from './wordpress.js';
export { scoreReport, scoreTone, gradeFor, cwvVerdict, vitals, CWV_THRESHOLDS, PENALTY_OVERRIDES, SECTION_LABELS, SECTION_WEIGHTS } from './score.js';
import { scoreReport } from './score.js';
import { explainFailure } from './reasons.js';
export { explainFailure } from './reasons.js';
import { applyProfile, profileSite } from './profile.js';
export { profileSite, applyProfile, PROFILE_LABELS } from './profile.js';

/**
 * Turn gathered data into the canonical Report. Pure and deterministic given the input
 * (and the fingerprint DB), so a stored GatheredData can always be re-analysed.
 */
export function analyse(data: GatheredData, opts: { screenshotUrl?: (path: string) => string } = {}): Report {
  const { db, categories } = loadFingerprints();
  const http = data.http ?? null;
  const final = http?.final ?? null;
  const tls = (data.cert as TlsInfo | null | undefined) ?? null;
  const browser = data.browser ?? null;

  // Prefer the rendered DOM when the browser stage succeeded; keep raw HTML for regex sources.
  const rawHtml = final?.body ?? '';
  const renderedHtml = browser?.renderedHtml ?? '';
  const baseUrl = browser?.finalUrl ?? final?.url ?? data.target.url;
  const parsed: ParsedHtml | null = rawHtml || renderedHtml ? parseHtml(renderedHtml || rawHtml, baseUrl) : null;

  let technologies: TechnologyDetection[] = [];
  if (final || browser) {
    const scripts: Record<string, string> = {};
    const thirdPartyScripts = new Set<string>();
    for (const f of data.files?.scripts ?? []) {
      if (!f.body) continue;
      scripts[f.path] = f.body;
      if (f.path.startsWith('http')) thirdPartyScripts.add(f.path);
    }
    for (const s of parsed?.inlineScripts ?? []) scripts[`inline#${Object.keys(scripts).length}`] = s;
    const dnsMap: Record<string, string[]> = data.dns
      ? { A: data.dns.A, AAAA: data.dns.AAAA, CNAME: data.dns.CNAME, MX: data.dns.MX.map((m) => m.exchange), NS: data.dns.NS, TXT: data.dns.TXT, SOA: data.dns.SOA ? [data.dns.SOA] : [], CAA: data.dns.CAA }
      : {};
    const input: DetectInput = {
      url: baseUrl,
      headers: final?.headers ?? {},
      cookies: [...(final?.cookies ?? []), ...(browser?.cookies.map((c) => `${c.name}=<redacted>`) ?? [])],
      html: rawHtml + (renderedHtml && renderedHtml !== rawHtml ? '\n' + renderedHtml : ''),
      scriptSrc: [...new Set([...(parsed?.scriptSrc ?? []), ...(browser?.requests.filter((r) => r.type === 'script').map((r) => r.url) ?? [])])],
      scripts,
      thirdPartyScripts,
      meta: parsed?.meta ?? {},
      dns: dnsMap,
      certIssuer: tls?.issuer ?? null,
      js: browser?.jsGlobals,
      xhr: browser?.requests.filter((r) => r.type === 'xhr' || r.type === 'fetch').map((r) => r.url),
      dom: parsed?.dom
    };
    technologies = detectTechnologies(input, db, categories);
  }

  const infra = summariseInfra(technologies, data.ips ?? [], data.dns ?? null, http?.challenge ?? browser?.blocked ?? null, data.target.registrableDomain);
  const robots = data.files ? analyseRobots(data.files.robots, baseUrl) : null;
  const seo = parsed && final ? analyseSeo(parsed, baseUrl, robots, data.files?.sitemap ?? null, final.headers) : null;
  const cookies = browser?.cookies ?? [];
  const rawSecurity = http ? auditSecurityHeaders(http, tls, parsed, browser ? cookies : null, technologies) : [];
  const xhrSameOrigin = browser ? browser.requests.filter((r) => (r.type === 'xhr' || r.type === 'fetch') && r.host === new URL(baseUrl).hostname).length : 0;
  // A bot-challenge page tells us nothing about the real site, so don't profile it.
  const blocked = !!(http?.challenge || browser?.blocked);
  const profile = parsed && !blocked ? profileSite({ technologies, html: parsed, cookies, xhrSameOrigin, security: rawSecurity }) : undefined;
  const security = profile ? applyProfile(rawSecurity, profile) : rawSecurity;
  const email = data.dns ? auditEmail(data.dns, data.target.registrableDomain, data.external?.blocklists) : [];
  const thirdParties = summariseThirdParties(parsed, browser?.requests ?? null, new URL(baseUrl).hostname, technologies);
  const cms = analyseWordPress(rawHtml || renderedHtml, data.files ?? null, technologies, data.external, final?.headers ?? {}, baseUrl) ?? analyseShopify(rawHtml || renderedHtml, technologies);
  const privacy = final || browser ? auditPrivacy(technologies, thirdParties, cookies, robots) : [];

  const cookieNames = [...(final?.cookies ?? []), ...cookies.map((c) => `${c.name}=`)];
  const php = final ? detectPhp(final.headers, cookieNames, parsed, technologies) : null;
  const aiReadiness = final ? analyseAiReadiness({ robots, llms: data.files?.llmsTxt ?? null, sitemap: data.files?.sitemap ?? null, rawHtml: rawHtml || renderedHtml, parsed, seo }) : null;
  const scriptSources = [{ source: 'page', text: rawHtml }, ...(data.files?.scripts ?? []).filter((f) => f.body).map((f) => ({ source: f.path, text: f.body! }))];
  const exposedSecrets = final ? findExposedSecrets(scriptSources) : [];
  const scriptBodies = (data.files?.scripts ?? []).filter((f) => f.body).map((f) => ({ source: f.path, body: f.body! }));
  const vulnerableLibraries = data.external?.retire ? findVulnerableLibraries(data.external.retire, [...new Set([...(parsed?.scriptSrc ?? []), ...scriptBodies.map((b) => b.source)])], scriptBodies) : null;
  const domainChecks = auditDomain(data.rdap ?? null);

  if (data.external?.safeBrowsing?.threats.length) {
    security.unshift({ id: 'safe-browsing', title: 'Google Safe Browsing', status: 'bad', observed: `Flagged: ${data.external.safeBrowsing.threats.join(', ')}.`, detail: 'Google currently lists this URL as unsafe. Browsers may show a warning page.' });
  }

  const scope = data.scan.scope ?? 'full';
  const focused = scope !== 'full';
  const plan = planFor(scope);
  // A focused scan is judged on the stages it ran: an email check has no page, and that is not a failure.
  const ranStatuses = (Object.entries(data.stages) as [StageName, { status: string }][]).filter(([k]) => plan.stages.includes(k)).map(([, v]) => v.status);
  const needsPage = plan.stages.includes('http');
  const quality: Report['scan']['quality'] = needsPage && !final && !browser ? 'failed' : http?.challenge || browser?.blocked ? 'restricted' : ranStatuses.some((s) => s === 'failed' || s === 'restricted') ? 'partial' : 'complete';

  const psi = data.external?.psi ?? null;
  const screenshot = browser?.screenshot && opts.screenshotUrl ? { url: opts.screenshotUrl(browser.screenshot.path), width: browser.screenshot.width, height: browser.screenshot.height } : psi?.screenshotDataUrl ? { dataUrl: psi.screenshotDataUrl } : null;

  const compression = final?.headers['content-encoding'] ?? null;
  const cacheHeaders: Record<string, string> = {};
  for (const k of ['cache-control', 'age', 'expires', 'etag', 'last-modified', 'vary', 'x-cache', 'cf-cache-status', 'x-vercel-cache', 'x-nf-request-id', 'x-kinsta-cache', 'x-cache-status']) if (final?.headers[k]) cacheHeaders[k] = final.headers[k]!;

  return {
    reportVersion: REPORT_VERSION,
    analyzedAt: new Date().toISOString(),
    target: data.target,
    scan: { ...data.scan, quality },
    stages: data.stages,
    technologies,
    infra,
    dns: data.dns ?? null,
    domain: data.rdap ?? null,
    cert: tls ? { issuer: tls.issuer, subject: tls.subject, notBefore: tls.notBefore, notAfter: tls.notAfter, sans: tls.sans, source: tls.source } : null,
    tls: tls ? { protocol: tls.protocol, alpn: tls.alpn, authorized: tls.authorized, authorizationError: tls.authorizationError, source: tls.source, cipher: tls.cipher ?? null, chain: tls.chain ?? [] } : null,
    http: http
      ? {
          finalUrl: final?.url ?? null,
          status: final?.status ?? null,
          chain: http.chain,
          server: final?.headers['server'] ?? null,
          poweredBy: final?.headers['x-powered-by'] ?? null,
          protocol: tls?.alpn ?? final?.protocol ?? null,
          compression,
          http3: /h3/.test(final?.headers['alt-svc'] ?? ''),
          cacheHeaders,
          challenge: http.challenge
        }
      : null,
    security,
    email,
    seo,
    robots,
    thirdParties,
    cms,
    php,
    aiReadiness,
    vulnerableLibraries,
    exposedSecrets,
    domainChecks,
    blocklists: data.external?.blocklists ?? null,
    propagation: data.external?.propagation ?? null,
    wellKnown: { securityTxt: data.files?.securityTxt?.status === 200, adsTxt: data.files?.adsTxt?.status === 200, llmsTxt: data.files?.llmsTxt?.status === 200 },
    cookies,
    privacy,
    performance: psi,
    screenshot,
    safeBrowsing: data.external?.safeBrowsing ?? null,
    external: { wayback: data.external?.wayback?.firstSeen ?? null, greenHosting: data.external?.greenHosting ?? null, subdomains: data.external?.subdomains ?? null },
    // A focused scan has no scores: sections it did not run would read as a perfect 100.
    scores: focused ? undefined : scoreReport({ security, email, privacy, seo, performance: psi, quality, failureReason: quality === 'failed' ? explainFailure(data.stages.http?.note) : null }),
    profile
  };
}

export function stageLabel(s: StageName): string {
  return { dns: 'Checking DNS', http: 'Fetching the page', files: 'Reading robots, sitemap and scripts', rdap: 'Looking up domain registration', cert: 'Inspecting TLS certificate', browser: 'Rendering in a browser', external: 'Running performance and safety checks' }[s];
}
