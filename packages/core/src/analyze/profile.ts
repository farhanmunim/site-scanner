import type { BrowserCookie, Finding, SiteProfile, TechnologyDetection } from '../types.js';
import type { ParsedHtml } from './html.js';

/**
 * What kind of site is this? Decides which checks matter. A static brochure site with no
 * forms, no logins and no cookies has nothing for clickjacking or CSP to protect, so those
 * findings are kept visible but marked low-impact and excluded from the score.
 */
export function profileSite(input: { technologies: TechnologyDetection[]; html: ParsedHtml | null; cookies: BrowserCookie[]; xhrSameOrigin: number; security: Finding[] }): SiteProfile {
  const { technologies, html, cookies } = input;
  const cat = (re: RegExp) => technologies.some((t) => !t.implied && t.confidence !== 'low' && t.categories.some((c) => re.test(c.name)));
  const forms = html?.forms.length ?? 0;
  const passwordForm = html?.forms.some((f) => f.hasPassword) ?? false;
  const loginLink = input.security.some((f) => f.id === 'login-page');
  const firstPartyCookies = cookies.filter((c) => !c.thirdParty).length;
  // A site *is* a shop only when it runs on a commerce platform. Payment buttons and
  // embedded merch widgets (Stripe, Fourthwall, Snipcart, Gumroad…) are a feature, not an identity.
  const SHOP_PLATFORMS = /^(Shopify|WooCommerce|Magento|Adobe Commerce|BigCommerce|PrestaShop|Salesforce Commerce Cloud|Wix Stores|Squarespace Commerce|Shopware|OpenCart|commercetools|Saleor|Medusa|Sylius|Ecwid|Webflow Ecommerce|Squarespace|Wix eCommerce|Shoplazza|Shopline|Zen Cart|osCommerce|nopCommerce|VTEX|Salla|Zid)$/i;
  const commerceTechs = technologies.filter((t) => !t.implied && t.confidence !== 'low' && t.categories.some((c) => /^(Ecommerce|Payment processors|Shopping carts)$/.test(c.name)));
  const platform = commerceTechs.find((t) => SHOP_PLATFORMS.test(t.name));
  const ecommerce = !!platform;
  const commerceWidget = !platform && commerceTechs.length ? commerceTechs[0]!.name : null;
  const cms = cat(/^(CMS|Blogs|Wikis|LMS|Ecommerce)$/);
  const staticGen = cat(/^Static site generators$/);
  const appFramework = cat(/^(JavaScript frameworks|Web frameworks)$/);
  const interactive = passwordForm || loginLink || input.xhrSameOrigin > 2 || firstPartyCookies > 0 || forms > 1;

  const signals: string[] = [];
  if (staticGen) signals.push('built with a static site generator');
  if (forms === 0) signals.push('no forms on the homepage');
  else signals.push(`${forms} form${forms === 1 ? '' : 's'} on the homepage`);
  if (passwordForm || loginLink) signals.push('has a login');
  if (firstPartyCookies) signals.push(`${firstPartyCookies} first-party cookie${firstPartyCookies === 1 ? '' : 's'}`);
  else if (cookies.length === 0 && html) signals.push('sets no cookies');
  if (input.xhrSameOrigin > 2) signals.push('talks to its own API');
  if (platform) signals.push(`runs on ${platform.name}`);
  else if (commerceWidget) signals.push(`embeds ${commerceWidget}`);

  let kind: SiteProfile['kind'];
  if (ecommerce) kind = 'shop';
  else if (passwordForm || loginLink || (appFramework && input.xhrSameOrigin > 2)) kind = 'app';
  else if (cms) kind = 'cms';
  else if (!interactive && html) kind = 'static';
  else kind = 'site';

  return { kind, interactive, signals };
}

export const PROFILE_LABELS: Record<SiteProfile['kind'], string> = { static: 'Static site', site: 'Website', cms: 'CMS site', app: 'Web app', shop: 'Online shop' };

/** Finding ids that only matter when the site has logins, forms, sessions or user data. */
const INTERACTIVE_ONLY = new Set(['csp', 'framing', 'coop', 'permissions', 'cookies', 'sri', 'login-page', 'referrer']);

/**
 * Downgrade checks that cannot hurt a non-interactive site: they stay in the report as
 * information, with a note, and carry no score penalty.
 */
export function applyProfile(findings: Finding[], profile: SiteProfile): Finding[] {
  if (profile.interactive) return findings;
  return findings.map((f) => {
    if (!INTERACTIVE_ONLY.has(f.id) || f.status === 'good' || f.status === 'bad') return f;
    return { ...f, status: 'info', relevance: 'low', detail: `${f.detail ? f.detail + ' ' : ''}Low impact here: this site has no logins, forms or sessions for an attacker to hijack, so this is not counted against the score.` };
  });
}
