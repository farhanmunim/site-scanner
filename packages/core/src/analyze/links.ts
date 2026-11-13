import type { BrowserData, Finding, LinksStageData, LinksSummary } from '../types.js';

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const isBroken = (status: number | null) => status !== null && (status === 404 || status === 410 || (status >= 400 && status !== 401 && status !== 403 && status !== 429));

/**
 * Broken links + broken page resources. Pure: works from the link stage (same-host link
 * checks, DNS-only external checks) and the browser stage's recorded responses.
 */
export function analyseLinks(links: LinksStageData | null | undefined, browser: BrowserData | null | undefined): LinksSummary | null {
  if (!links && !browser) return null;
  const findings: Finding[] = [];

  const broken = links?.checked.filter((c) => isBroken(c.status)) ?? [];
  const unreachable = links?.checked.filter((c) => c.status === null) ?? [];

  if (links) {
    const n = links.checked.length;
    const scope = links.complete
      ? `every link we could check on this page${links.sitemapUrls ? ' and in the sitemap' : ''}`
      : `${n} of ${links.candidates} links${links.sitemapUrls ? ' from the page and sitemap' : ''}`;
    if (links.candidates === 0) {
      findings.push({ id: 'broken-links', title: 'Internal links', status: 'info', observed: links.pageLinks ? 'No links on this site were eligible for checking (see skipped links below).' : 'No links to other pages on this site were found.' });
    } else if (broken.length) {
      const fromSitemap = broken.filter((b) => b.sources.includes('sitemap')).length;
      findings.push({
        id: 'broken-links',
        title: 'Broken internal links',
        status: 'bad',
        observed: `${plural(broken.length, 'link')} broken out of ${n} checked (${scope}).`,
        detail: `${fromSitemap ? `${fromSitemap} of these are listed in the sitemap, so search engines are being sent to missing pages. ` : ''}Fix or remove the links, or redirect the old URLs.`,
        evidence: broken.slice(0, 20).map((b) => ({ source: 'url' as const, key: `HTTP ${b.status} · ${b.sources.join(' + ')}`, value: b.url }))
      });
    } else {
      findings.push({ id: 'broken-links', title: 'Internal links', status: 'good', observed: `All ${n} checked links work (${scope}).` });
    }

    if (unreachable.length) {
      findings.push({
        id: 'unreachable-links',
        title: 'Links that did not respond',
        status: 'warn',
        observed: `${plural(unreachable.length, 'link')} timed out or failed to connect.`,
        detail: 'Often temporary. Re-scan later before treating these as broken.',
        evidence: unreachable.slice(0, 20).map((b) => ({ source: 'url' as const, key: b.error ?? 'error', value: b.url }))
      });
    }

    if (links.stoppedReason) findings.push({ id: 'links-stopped', title: 'Link check stopped early', status: 'info', observed: links.stoppedReason + '.' });

    const s = links.skipped;
    const skippedTotal = s.robots + s.query + s.unsafe;
    if (skippedTotal) {
      const parts = [s.robots && `${s.robots} disallowed by robots.txt`, s.query && `${s.query} with a query string`, s.unsafe && `${s.unsafe} that could change state (cart, logout, admin…)`].filter(Boolean);
      findings.push({ id: 'links-skipped', title: 'Links not checked', status: 'info', observed: `${plural(skippedTotal, 'link')} skipped: ${parts.join(', ')}.`, detail: 'The scanner only requests pages that are safe to fetch and that robots.txt allows.' });
    }

    if (links.external.deadHosts.length) {
      findings.push({
        id: 'dead-domains',
        title: 'Links to domains that no longer exist',
        status: 'bad',
        observed: `${plural(links.external.deadHosts.length, 'linked domain')} ${links.external.deadHosts.length === 1 ? 'does' : 'do'} not exist in DNS: ${links.external.deadHosts.map((d) => d.host).slice(0, 5).join(', ')}.`,
        detail: 'Expired or mistyped domains. An expired domain can be re-registered by someone else, so remove or update these links.',
        evidence: links.external.deadHosts.flatMap((d) => d.links.map((l) => ({ source: 'url' as const, key: d.host, value: l }))).slice(0, 20)
      });
    } else if (links.external.hosts) {
      findings.push({ id: 'dead-domains', title: 'External links', status: 'good', observed: `All ${links.external.checked} linked external domains exist${links.external.hosts > links.external.checked ? ` (${links.external.checked} of ${links.external.hosts} looked up)` : ''}. External pages themselves are not requested.` });
    }

    if (links.insecureLinks.total) {
      findings.push({
        id: 'insecure-links',
        title: 'Links using http://',
        status: 'info',
        observed: `${plural(links.insecureLinks.total, 'link')} on this https page ${links.insecureLinks.total === 1 ? 'uses' : 'use'} plain http://.`,
        detail: 'Switch them to https:// where the destination supports it.',
        evidence: links.insecureLinks.sample.map((v) => ({ source: 'url' as const, value: v }))
      });
    }
  }

  // Resources the page tried to load that came back as errors (captured by the browser, no extra requests).
  const brokenResources = (browser?.requests ?? [])
    .filter((r) => r.status !== null && r.status >= 400 && r.type !== 'document')
    .map((r) => ({ url: r.url, status: r.status!, type: r.type, thirdParty: r.thirdParty }));
  if (browser && !browser.blocked) {
    if (brokenResources.length) {
      const first = brokenResources.filter((r) => !r.thirdParty).length;
      findings.push({
        id: 'broken-resources',
        title: 'Broken page resources',
        status: first ? 'bad' : 'warn',
        observed: `${plural(brokenResources.length, 'resource')} (images, scripts, styles…) failed to load${first ? `, ${first} from this site` : ', all from third parties'}.`,
        evidence: brokenResources.slice(0, 20).map((r) => ({ source: 'url' as const, key: `HTTP ${r.status} · ${r.type}${r.thirdParty ? ' · third party' : ''}`, value: r.url }))
      });
    } else {
      findings.push({ id: 'broken-resources', title: 'Page resources', status: 'good', observed: 'Every image, script and stylesheet the page loaded responded without an error.' });
    }
  }

  return {
    findings,
    coverage: links ? { checked: links.checked.length, candidates: links.candidates, complete: links.complete, pageLinks: links.pageLinks, sitemapUrls: links.sitemapUrls, skipped: links.skipped, stoppedReason: links.stoppedReason } : null,
    broken,
    unreachable,
    brokenResources,
    deadHosts: links?.external.deadHosts ?? [],
    external: links ? { hosts: links.external.hosts, checked: links.external.checked } : null
  };
}
