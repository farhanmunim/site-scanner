import type { MediaFile, SocialPreview } from '../types.js';
import type { ParsedHtml } from './html.js';

const NETWORKS: [string, RegExp][] = [
  ['Facebook', /^(?:[a-z]+\.)?facebook\.com$/],
  ['Instagram', /^(?:www\.)?instagram\.com$/],
  ['X (Twitter)', /^(?:www\.|mobile\.)?(?:x|twitter)\.com$/],
  ['LinkedIn', /^(?:[a-z]+\.)?linkedin\.com$/],
  ['YouTube', /^(?:www\.|m\.)?youtube\.com$/],
  ['TikTok', /^(?:www\.)?tiktok\.com$/],
  ['Pinterest', /^(?:[a-z]+\.)?pinterest\.[a-z.]+$/],
  ['GitHub', /^(?:www\.)?github\.com$/],
  ['Threads', /^(?:www\.)?threads\.net$/],
  ['Bluesky', /^bsky\.app$/],
  ['Mastodon', /^(?:mastodon\.social|fosstodon\.org|hachyderm\.io)$/]
];
const SHARE_PATHS = /\/(sharer|share|intent|dialog|shareArticle|pin\/create|sharing|oauth|login|plugins)\b|\bshare\?|[?&]u=|[?&]url=|[?&]text=/i;

/** Links to the site's own accounts. Share buttons ("Tweet this", "Pin it") point at the same networks and are not profiles. */
export function findProfiles(links: { href: string }[], pageHost: string): { network: string; url: string }[] {
  const out: { network: string; url: string }[] = [];
  for (const l of links) {
    let u: URL;
    try {
      u = new URL(l.href);
    } catch {
      continue;
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') continue;
    const host = u.hostname.toLowerCase();
    const net = NETWORKS.find(([, re]) => re.test(host))?.[0];
    if (!net || out.some((o) => o.network === net)) continue;
    if (u.pathname.replace(/\/$/, '') === '' || SHARE_PATHS.test(u.pathname + u.search)) continue;
    if (host === pageHost || host.endsWith('.' + pageHost)) continue;
    out.push({ network: net, url: `${u.origin}${u.pathname}`.slice(0, 200) });
    if (out.length >= 10) break;
  }
  return out;
}

/**
 * What a site looks like in three places people actually see it: the browser tab (favicon), a search result
 * (title, address, description) and a shared link (Open Graph / X card). Pure; the image bytes were fetched earlier.
 */
export function extractSocial(parsed: ParsedHtml, pageUrl: string, media: { favicon: MediaFile | null; ogImage: MediaFile | null } | undefined, screenshotUrl?: (path: string) => string): SocialPreview {
  const first = (k: string) => parsed.meta[k]?.[0]?.trim() || null;
  const abs = (v: string | null) => {
    if (!v) return null;
    try {
      return new URL(v, pageUrl).toString();
    } catch {
      return null;
    }
  };
  const served = media?.ogImage?.path && screenshotUrl ? screenshotUrl(media.ogImage.path) : null;
  const ogImageSrc = abs(first('og:image') ?? first('og:image:secure_url'));
  const twImageSrc = abs(first('twitter:image') ?? first('twitter:image:src'));
  const w = Number(first('og:image:width')) || 0;
  const h = Number(first('og:image:height')) || 0;
  const fav = media?.favicon;

  const title = parsed.title?.trim() || null;
  const description = first('description');
  const og = {
    title: first('og:title'),
    description: first('og:description'),
    type: first('og:type'),
    url: abs(first('og:url')),
    siteName: first('og:site_name'),
    imageUrl: ogImageSrc ? served : null,
    imageAlt: first('og:image:alt'),
    imageSource: ogImageSrc,
    imageSize: (w && h ? [w, h] : null) as [number, number] | null
  };
  const twitter = { card: first('twitter:card'), title: first('twitter:title'), description: first('twitter:description'), imageUrl: ogImageSrc || twImageSrc ? served : null, site: first('twitter:site') };

  const notes: string[] = [];
  if (!og.title && !og.description && !og.imageSource) notes.push('No Open Graph tags: Facebook, LinkedIn, Slack and WhatsApp build the preview from whatever they can guess, often a bare link.');
  else {
    if (!og.imageSource && !twImageSrc) notes.push('No share image (og:image): shared links show a text-only card with no picture.');
    else if (!served) notes.push('A share image is declared but could not be loaded (blocked, too large or not a supported image), so platforms may not show it either.');
    if (!og.title) notes.push('No og:title: platforms fall back to the page title.');
    if (!og.description) notes.push('No og:description: platforms show a generic or empty description.');
    if (w && h && (w < 600 || w / h < 1.5 || w / h > 2.2)) notes.push(`The share image is ${w}×${h}. 1200×630 (about 1.9:1) fills the card on every platform; other shapes get cropped or shrunk.`);
  }
  if (!twitter.card) notes.push('No twitter:card: X shows the small summary card; set summary_large_image for the big picture card.');
  if (!fav) notes.push('No favicon could be loaded: browser tabs and bookmarks show a blank icon.');
  if (title && title.length > 60) notes.push(`The page title is ${title.length} characters; Google shows about 60.`);
  if (description && description.length > 160) notes.push(`The meta description is ${description.length} characters; Google shows about 155–160.`);
  if (!description) notes.push('No meta description: Google writes its own snippet from the page.');

  return {
    title,
    description,
    url: pageUrl,
    siteName: og.siteName,
    favicon: { dataUrl: fav?.base64 ? `data:${fav.contentType};base64,${fav.base64}` : null, sourceUrl: fav?.url ?? abs(parsed.favicon) },
    og,
    twitter,
    profiles: findProfiles(parsed.links, new URL(pageUrl).hostname),
    notes
  };
}
