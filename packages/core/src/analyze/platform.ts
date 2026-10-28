import type { Confidence, PlatformVerdict, TechnologyDetection } from '../types.js';

const CMS = new Set([1, 11]);
const SHOP = new Set([6]);
const BUILDER = new Set([51, 66]);
const FRAMEWORK = new Set([12, 18]);

/** Frameworks that are libraries rather than a way a site is "built with" (animation, state, UI kits). */
const NOT_A_PLATFORM = /^(jquery|react|vue\.js|angular|svelte|alpine\.js|lodash|bootstrap|tailwind css|core-js|webpack|framer motion|gsap|swiper)/i;

/**
 * Headless content backends supply content to a site built some other way; seeing one (often just an image host in a
 * meta tag) says nothing about what the site itself is built with, so they never become the verdict.
 */
const HEADLESS = /^(contentful|sanity|prismic|storyblok|strapi|datocms|hygraph|graphcms|directus|cosmic|butter ?cms|kontent|agility cms|payload|tinacms|builder\.io|netlify cms|decap cms|contentstack|dato)/i;

function kindOf(t: TechnologyDetection): PlatformVerdict['kind'] | null {
  const ids = t.categories.map((c) => c.id);
  if (ids.some((i) => BUILDER.has(i)) || (t.saas && ids.some((i) => CMS.has(i)))) return 'builder';
  if (ids.some((i) => SHOP.has(i))) return 'ecommerce';
  if (ids.some((i) => CMS.has(i))) return 'cms';
  if (ids.some((i) => FRAMEWORK.has(i)) && !NOT_A_PLATFORM.test(t.name)) return 'framework';
  return null;
}

const RANK: Record<PlatformVerdict['kind'], number> = { builder: 4, ecommerce: 3, cms: 3, framework: 1 };

/**
 * One answer to "what is this site built with?": the strongest non-implied CMS, shop or website builder,
 * falling back to the main framework. DNS verification TXT records never count (they are capped low upstream).
 */
export function detectPlatform(techs: TechnologyDetection[]): PlatformVerdict | null {
  const cands = techs
    .filter((t) => !t.implied && t.score >= 50 && !HEADLESS.test(t.name))
    .map((t) => ({ t, kind: kindOf(t) }))
    .filter((c): c is { t: TechnologyDetection; kind: PlatformVerdict['kind'] } => c.kind !== null)
    .sort((a, b) => RANK[b.kind] - RANK[a.kind] || b.t.score - a.t.score);
  const top = cands[0];
  if (!top) return null;
  const real = top.t.evidence.find((e) => e.source !== 'implied' && e.source !== 'dns') ?? top.t.evidence[0];
  return {
    name: top.t.name,
    kind: top.kind,
    version: top.t.version,
    confidence: top.t.confidence as Confidence,
    website: top.t.website,
    evidence: real ? `${real.source}${real.key ? ` ${real.key}` : ''}: ${real.value}`.slice(0, 160) : '',
    alternatives: cands.slice(1, 4).map((c) => c.t.name)
  };
}
