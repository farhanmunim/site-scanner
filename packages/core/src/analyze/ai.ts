import type { AiReadiness, FetchedFile, FindingStatus, RobotsSummary, SeoSummary } from '../types.js';
import type { ParsedHtml } from './html.js';

type Item = AiReadiness['items'][number];

function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function grade(score: number): AiReadiness['grade'] {
  return score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
}

/** Can ChatGPT, Claude and Perplexity find, read and understand the site? Based only on public signals. */
export function analyseAiReadiness(input: { robots: RobotsSummary | null; llms: FetchedFile | null; sitemap: FetchedFile | null; rawHtml: string; parsed: ParsedHtml | null; seo: SeoSummary | null }): AiReadiness {
  const { robots, llms, sitemap, rawHtml, parsed, seo } = input;
  const items: Item[] = [];
  const add = (id: string, title: string, status: FindingStatus, observed: string, points: number, max: number, detail?: string) => items.push({ id, title, status, observed, detail, points: Math.round(points), max });

  const checked = robots?.aiCrawlers.length ?? 0;
  const blocked = robots?.aiCrawlers.filter((c) => c.blocked).length ?? 0;
  const wildcardBlock = !!robots?.disallowAll;
  if (wildcardBlock) add('crawler-access', 'AI crawler access', 'bad', 'robots.txt blocks every crawler (Disallow: /).', 0, 30, 'AI assistants cannot read the site, so they cannot cite or recommend it.');
  else if (blocked === 0) add('crawler-access', 'AI crawler access', 'good', robots?.present ? `No AI crawlers blocked (${checked} checked).` : 'No robots.txt, so crawlers are allowed by default.', 30, 30);
  else add('crawler-access', 'AI crawler access', blocked === checked ? 'bad' : 'warn', `Blocks ${blocked} of ${checked} AI crawlers: ${robots!.aiCrawlers.filter((c) => c.blocked).map((c) => c.agent).join(', ')}.`, 30 * (1 - blocked / checked), 30, 'Blocking is a legitimate choice (training opt-out), but it also keeps the site out of AI answers.');

  const body = llms?.status === 200 ? llms.body ?? '' : '';
  const llmsInfo = llms?.status === 200 && body ? { present: true, hasTitle: /^#\s+\S/m.test(body), links: (body.match(/\]\(https?:\/\/[^)]+\)|\]\(\/[^)]*\)/g) ?? []).length } : llms ? { present: false, hasTitle: false, links: 0 } : null;
  if (llmsInfo?.present) add('llms-txt', 'llms.txt', llmsInfo.hasTitle && llmsInfo.links > 0 ? 'good' : 'warn', `Present${llmsInfo.hasTitle ? ', with a title' : ', but no "# Title" line'}; ${llmsInfo.links} link(s).`, llmsInfo.hasTitle && llmsInfo.links > 0 ? 15 : 8, 15, llmsInfo.hasTitle && llmsInfo.links > 0 ? undefined : 'A short guide starts with "# Site name", a one-line summary, then links to the key pages.');
  else add('llms-txt', 'llms.txt', 'warn', 'Not found.', 0, 15, 'A short /llms.txt guide helps assistants understand what the site is and where its key pages are.');

  const words = visibleText(rawHtml).split(' ').filter((w) => w.length > 1).length;
  add('readable-content', 'Readable content', words >= 300 ? 'good' : words >= 100 ? 'warn' : 'bad', `${words} words in the HTML sent to crawlers.`, words >= 300 ? 20 : words >= 100 ? 10 : 0, 20, words < 100 ? 'Most AI crawlers do not run JavaScript. If the page text only appears after scripts run, they see an empty page; server-render the important content.' : undefined);

  const types = seo?.structuredData.types ?? [];
  const sd = types.length > 0;
  add('structured-data', 'Structured data', sd ? 'good' : seo?.structuredData.microdata ? 'warn' : 'warn', sd ? `JSON-LD types: ${types.slice(0, 6).join(', ')}.` : seo?.structuredData.microdata ? 'Microdata only.' : 'None found.', sd ? 15 : seo?.structuredData.microdata ? 8 : 0, 15, sd ? undefined : 'Schema.org JSON-LD (Organization, WebSite, Article, Product…) tells machines what the page is about.');

  const hasSitemap = sitemap?.status === 200 || (robots?.sitemaps.length ?? 0) > 0;
  add('discoverability', 'Discoverability', hasSitemap ? 'good' : 'warn', hasSitemap ? 'Sitemap found.' : 'No sitemap found.', hasSitemap ? 10 : 0, 10, hasSitemap ? undefined : 'A sitemap.xml (listed in robots.txt) shows crawlers every page worth reading.');

  const text = visibleText(rawHtml);
  const identity: string[] = [];
  if (parsed?.links.some((l) => /\/(about|contact|impressum|team)\b/i.test(l.href))) identity.push('About/Contact page linked');
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text) || parsed?.links.some((l) => /^mailto:/i.test(l.href))) identity.push('email address');
  if (/(\+\d[\d\s().-]{7,}|\(\d{3}\)\s?\d{3}[-\s]?\d{4})/.test(text) || parsed?.links.some((l) => /^tel:/i.test(l.href))) identity.push('phone number');
  if (types.some((t) => /Organization|LocalBusiness|Person|Corporation/i.test(t))) identity.push('Organization schema');
  add('identity', 'Who is behind the site', identity.length >= 2 ? 'good' : 'warn', identity.length ? `Found: ${identity.join(', ')}.` : 'No About/Contact link, email, phone or Organization schema found.', identity.length >= 2 ? 10 : identity.length ? 5 : 0, 10, identity.length >= 2 ? undefined : 'Assistants favour sources they can attribute. Link an About and Contact page and publish a way to reach you.');

  const score = Math.round(items.reduce((a, i) => a + i.points, 0));
  return { score, grade: grade(score), items, wordCount: words, crawlersBlocked: blocked, crawlersChecked: checked, llmsTxt: llmsInfo };
}
