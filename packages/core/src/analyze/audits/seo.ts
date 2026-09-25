import type { Finding, SeoSummary, RobotsSummary, FetchedFile } from '../../types.js';
import type { ParsedHtml } from '../html.js';
import { sameSite } from '../../gather/url.js';

const AI_CRAWLERS = ['GPTBot', 'ChatGPT-User', 'ClaudeBot', 'anthropic-ai', 'Google-Extended', 'CCBot', 'PerplexityBot', 'Bytespider', 'Applebot-Extended', 'Amazonbot', 'meta-externalagent'];

export function analyseRobots(file: FetchedFile | null, pageUrl: string): RobotsSummary | null {
  if (!file || file.status !== 200 || !file.body) return { present: false, sitemaps: [], disallowAll: false, aiCrawlers: [], groups: 0 };
  const lines = file.body.split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  const groups: { agents: string[]; disallow: string[]; allow: string[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  const sitemaps: string[] = [];
  for (const line of lines) {
    const [k, ...rest] = line.split(':');
    const key = (k ?? '').trim().toLowerCase();
    const val = rest.join(':').trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], disallow: [], allow: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === 'sitemap') sitemaps.push(val);
    else if (cur && key === 'disallow') cur.disallow.push(val);
    else if (cur && key === 'allow') cur.allow.push(val);
  }
  const groupFor = (agent: string) => groups.find((g) => g.agents.includes(agent.toLowerCase())) ?? groups.find((g) => g.agents.includes('*'));
  const blocksAll = (g: { disallow: string[]; allow: string[] } | undefined) => !!g && g.disallow.includes('/') && !g.allow.some((a) => a === '/' || a === '');
  void pageUrl;
  return {
    present: true,
    sitemaps,
    disallowAll: blocksAll(groupFor('*')),
    aiCrawlers: AI_CRAWLERS.map((a) => ({ agent: a, blocked: blocksAll(groupFor(a)) })),
    groups: groups.length
  };
}

export function analyseSeo(html: ParsedHtml, finalUrl: string, robots: RobotsSummary | null, sitemap: FetchedFile | null, headers: Record<string, string>): SeoSummary {
  const findings: Finding[] = [];
  const m = (k: string) => html.meta[k]?.[0] ?? null;
  const title = html.title;
  const desc = m('description');
  const robotsMeta = m('robots');
  const xRobots = headers['x-robots-tag'] ?? null;
  const pageHost = new URL(finalUrl).hostname;

  if (!title) findings.push({ id: 'title', title: 'Page title', status: 'bad', observed: 'No <title> element.' });
  else if (title.length < 15) findings.push({ id: 'title', title: 'Page title', status: 'warn', observed: `"${title}" (${title.length} characters) — short.` });
  else if (title.length > 65) findings.push({ id: 'title', title: 'Page title', status: 'warn', observed: `${title.length} characters — search results typically truncate after ~60.` });
  else findings.push({ id: 'title', title: 'Page title', status: 'good', observed: `"${title}" (${title.length} characters).` });

  if (!desc) findings.push({ id: 'description', title: 'Search description', status: 'warn', observed: 'Not present. Search engines will generate their own snippet.' });
  else if (desc.length > 160) findings.push({ id: 'description', title: 'Search description', status: 'warn', observed: `${desc.length} characters — often truncated after ~155.` });
  else findings.push({ id: 'description', title: 'Search description', status: 'good', observed: `${desc.length} characters.` });

  if (!html.canonical) findings.push({ id: 'canonical', title: 'Canonical address', status: 'info', observed: 'No canonical link. Fine for single-URL pages; helps when content is reachable at several URLs.' });
  else if (html.canonical.replace(/\/$/, '') !== finalUrl.replace(/\/$/, '')) findings.push({ id: 'canonical', title: 'Canonical address', status: 'info', observed: `Canonical points to ${html.canonical} (differs from the scanned URL).` });
  else findings.push({ id: 'canonical', title: 'Canonical address', status: 'good', observed: 'Self-referencing canonical present.' });

  const noindex = /noindex/i.test(robotsMeta ?? '') || /noindex/i.test(xRobots ?? '');
  if (noindex) findings.push({ id: 'indexable', title: 'Search engines allowed', status: 'warn', observed: `noindex is set via ${/noindex/i.test(robotsMeta ?? '') ? 'meta robots' : 'X-Robots-Tag'}. Search engines will not index this page.` });
  else if (robots?.disallowAll) findings.push({ id: 'indexable', title: 'Search engines allowed', status: 'warn', observed: 'robots.txt disallows all crawling for every user agent.' });
  else findings.push({ id: 'indexable', title: 'Search engines allowed', status: 'good', observed: 'No noindex directive; crawling permitted.' });

  const h1 = html.headings['h1'] ?? [];
  if (h1.length === 0) findings.push({ id: 'h1', title: 'Main heading (H1)', status: 'warn', observed: 'No H1 found in the HTML.' });
  else if (h1.length > 1) findings.push({ id: 'h1', title: 'Main heading (H1)', status: 'info', observed: `${h1.length} H1 headings.` });
  else findings.push({ id: 'h1', title: 'Main heading (H1)', status: 'good', observed: `"${h1[0]!.slice(0, 80)}"` });

  if (!html.lang) findings.push({ id: 'lang', title: 'Page language', status: 'warn', observed: 'No lang attribute on <html>.', detail: 'Helps screen readers and search engines pick the right language.' });
  if (!m('viewport')) findings.push({ id: 'viewport', title: 'Viewport', status: 'warn', observed: 'No viewport meta tag; the page may not be mobile-friendly.' });

  const og: Record<string, string> = {};
  const tw: Record<string, string> = {};
  for (const [k, v] of Object.entries(html.meta)) {
    if (k.startsWith('og:')) og[k] = v[0]!;
    if (k.startsWith('twitter:')) tw[k] = v[0]!;
  }
  if (!og['og:title'] && !og['og:image']) findings.push({ id: 'og', title: 'Social sharing preview', status: 'info', observed: 'No Open Graph tags; link previews on social platforms will be generic.' });
  else findings.push({ id: 'og', title: 'Social sharing preview', status: og['og:image'] ? 'good' : 'info', observed: `${Object.keys(og).length} og: tag(s)${og['og:image'] ? ' including an image' : ', no og:image'}.` });

  const missingAlt = html.images.filter((i) => i.alt === null || i.alt === undefined).length;
  if (html.images.length) findings.push({ id: 'img-alt', title: 'Image descriptions (alt text)', status: missingAlt === 0 ? 'good' : missingAlt / html.images.length > 0.3 ? 'warn' : 'info', observed: `${missingAlt} of ${html.images.length} images have no alt attribute.` });

  const types = new Set<string>();
  const walk = (v: unknown, depth = 0) => {
    if (depth > 6 || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
    const t = (v as Record<string, unknown>)['@type'];
    if (typeof t === 'string') types.add(t);
    if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && types.add(x));
    for (const val of Object.values(v as Record<string, unknown>)) walk(val, depth + 1);
  };
  html.jsonLd.forEach((j) => walk(j));
  if (html.jsonLd.length || html.microdata) findings.push({ id: 'structured-data', title: 'Structured data', status: html.jsonLdErrors.length ? 'warn' : 'good', observed: `${html.jsonLd.length} JSON-LD block(s)${types.size ? `: ${[...types].slice(0, 8).join(', ')}` : ''}${html.microdata ? '; microdata present' : ''}${html.jsonLdErrors.length ? `; ${html.jsonLdErrors.length} block(s) failed to parse` : ''}.` });
  else findings.push({ id: 'structured-data', title: 'Structured data', status: 'info', observed: 'No JSON-LD or microdata found.' });

  findings.push(robots?.present ? { id: 'robots', title: 'robots.txt', status: 'good', observed: `Present (${robots.groups} group(s), ${robots.sitemaps.length} sitemap reference(s)).` } : { id: 'robots', title: 'robots.txt', status: 'info', observed: 'Not found.' });
  const sitemapOk = sitemap && sitemap.status === 200 && /<(urlset|sitemapindex)/i.test(sitemap.body ?? '');
  findings.push(sitemapOk ? { id: 'sitemap', title: 'Sitemap', status: 'good', observed: `/sitemap.xml present (${/<sitemapindex/i.test(sitemap!.body!) ? 'sitemap index' : `${(sitemap!.body!.match(/<loc>/g) ?? []).length}${sitemap!.truncated ? '+' : ''} URLs`}).` } : robots?.sitemaps.length ? { id: 'sitemap', title: 'Sitemap', status: 'good', observed: `Referenced from robots.txt: ${robots.sitemaps[0]}` } : { id: 'sitemap', title: 'Sitemap', status: 'info', observed: 'No /sitemap.xml and none referenced in robots.txt.' });

  let internal = 0,
    external = 0,
    nofollow = 0;
  for (const l of html.links) {
    if (sameSite(new URL(l.href).hostname, pageHost)) internal++;
    else external++;
    if (l.nofollow) nofollow++;
  }
  const headingCounts: Record<string, number> = {};
  for (const [k, v] of Object.entries(html.headings)) headingCounts[k] = v.length;

  return {
    title,
    titleLength: title?.length ?? 0,
    metaDescription: desc,
    metaDescriptionLength: desc?.length ?? 0,
    canonical: html.canonical,
    robotsMeta: robotsMeta ?? xRobots,
    lang: html.lang,
    viewport: m('viewport'),
    charset: m('charset'),
    h1,
    headingCounts,
    openGraph: og,
    twitter: tw,
    images: { total: html.images.length, missingAlt },
    links: { internal, external, nofollow },
    structuredData: { types: [...types], jsonLdCount: html.jsonLd.length, microdata: html.microdata, errors: html.jsonLdErrors },
    favicon: html.favicon,
    manifest: html.manifest,
    hreflang: html.hreflang,
    findings
  };
}
