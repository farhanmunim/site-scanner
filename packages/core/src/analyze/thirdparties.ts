import { parse as parseDomain } from 'tldts';
import type { BrowserRequest, Report, TechnologyDetection } from '../types.js';
import type { ParsedHtml } from './html.js';

/** Vendor domain → (technology, category). Complements fingerprint detections for hosts we saw but nothing matched. */
const VENDORS: [RegExp, string, string][] = [
  [/(^|\.)google-analytics\.com$|(^|\.)analytics\.google\.com$/, 'Google Analytics', 'Analytics'],
  [/(^|\.)googletagmanager\.com$/, 'Google Tag Manager', 'Tag managers'],
  [/^stats\.g\.doubleclick\.net$/, 'Google Analytics (Google Signals)', 'Analytics'],
  [/^www\.google\.[a-z.]{2,6}$/, 'Google Analytics (audience ping)', 'Analytics'],
  [/(^|\.)googlesyndication\.com$|(^|\.)doubleclick\.net$|(^|\.)googleadservices\.com$/, 'Google Ads', 'Advertising'],
  [/(^|\.)fonts\.googleapis\.com$|(^|\.)fonts\.gstatic\.com$/, 'Google Fonts', 'Font scripts'],
  [/(^|\.)maps\.googleapis\.com$|(^|\.)maps\.gstatic\.com$/, 'Google Maps', 'Maps'],
  [/(^|\.)recaptcha\.net$|(^|\.)www\.google\.com$/, 'Google (reCAPTCHA/APIs)', 'Security'],
  [/(^|\.)youtube\.com$|(^|\.)ytimg\.com$|(^|\.)youtube-nocookie\.com$/, 'YouTube', 'Video players'],
  [/(^|\.)facebook\.net$|(^|\.)facebook\.com$|(^|\.)fbcdn\.net$/, 'Meta Pixel / Facebook', 'Advertising'],
  [/(^|\.)instagram\.com$|(^|\.)cdninstagram\.com$/, 'Instagram', 'Widgets'],
  [/(^|\.)linkedin\.com$|(^|\.)licdn\.com$/, 'LinkedIn Insight', 'Advertising'],
  [/(^|\.)twitter\.com$|(^|\.)twimg\.com$|(^|\.)x\.com$/, 'X (Twitter)', 'Widgets'],
  [/(^|\.)tiktok\.com$/, 'TikTok Pixel', 'Advertising'],
  [/(^|\.)pinterest\.com$|(^|\.)pinimg\.com$/, 'Pinterest', 'Advertising'],
  [/(^|\.)hotjar\.com$|(^|\.)hotjar\.io$/, 'Hotjar', 'Analytics'],
  [/(^|\.)clarity\.ms$/, 'Microsoft Clarity', 'Analytics'],
  [/(^|\.)plausible\.io$/, 'Plausible', 'Analytics'],
  [/(^|\.)posthog\.com$/, 'PostHog', 'Analytics'],
  [/(^|\.)mixpanel\.com$/, 'Mixpanel', 'Analytics'],
  [/(^|\.)segment\.com$|(^|\.)segment\.io$/, 'Segment', 'Customer data platform'],
  [/(^|\.)amplitude\.com$/, 'Amplitude', 'Analytics'],
  [/(^|\.)matomo\.cloud$/, 'Matomo', 'Analytics'],
  [/(^|\.)sentry\.io$|(^|\.)ingest\.sentry\.io$/, 'Sentry', 'Issue trackers'],
  [/(^|\.)datadoghq\.com$|(^|\.)datadoghq-browser-agent\.com$/, 'Datadog RUM', 'RUM'],
  [/(^|\.)newrelic\.com$|(^|\.)nr-data\.net$/, 'New Relic', 'RUM'],
  [/(^|\.)bugsnag\.com$/, 'Bugsnag', 'Issue trackers'],
  [/(^|\.)stripe\.com$|(^|\.)stripe\.network$/, 'Stripe', 'Payment processors'],
  [/(^|\.)paypal\.com$|(^|\.)paypalobjects\.com$/, 'PayPal', 'Payment processors'],
  [/(^|\.)klarna\.com$/, 'Klarna', 'Buy now pay later'],
  [/(^|\.)intercom\.io$|(^|\.)intercomcdn\.com$/, 'Intercom', 'Live chat'],
  [/(^|\.)crisp\.chat$/, 'Crisp', 'Live chat'],
  [/(^|\.)tawk\.to$/, 'Tawk.to', 'Live chat'],
  [/(^|\.)zendesk\.com$|(^|\.)zdassets\.com$/, 'Zendesk', 'Live chat'],
  [/(^|\.)hubspot\.com$|(^|\.)hs-scripts\.com$|(^|\.)hsforms\.net$|(^|\.)hubspotusercontent/, 'HubSpot', 'Marketing automation'],
  [/(^|\.)mailchimp\.com$|(^|\.)list-manage\.com$|(^|\.)chimpstatic\.com$/, 'Mailchimp', 'Marketing automation'],
  [/(^|\.)klaviyo\.com$/, 'Klaviyo', 'Marketing automation'],
  [/(^|\.)activehosted\.com$/, 'ActiveCampaign', 'Marketing automation'],
  [/(^|\.)cookiebot\.com$|(^|\.)consentcdn\.cookiebot\.com$/, 'Cookiebot', 'Cookie compliance'],
  [/(^|\.)onetrust\.com$|(^|\.)cookielaw\.org$/, 'OneTrust', 'Cookie compliance'],
  [/(^|\.)iubenda\.com$/, 'iubenda', 'Cookie compliance'],
  [/(^|\.)cookieyes\.com$/, 'CookieYes', 'Cookie compliance'],
  [/(^|\.)cloudflareinsights\.com$/, 'Cloudflare Web Analytics', 'Analytics'],
  [/(^|\.)cdnjs\.cloudflare\.com$/, 'cdnjs', 'CDN'],
  [/(^|\.)jsdelivr\.net$/, 'jsDelivr', 'CDN'],
  [/(^|\.)unpkg\.com$/, 'unpkg', 'CDN'],
  [/(^|\.)bootstrapcdn\.com$/, 'BootstrapCDN', 'CDN'],
  [/(^|\.)cloudfront\.net$/, 'Amazon CloudFront', 'CDN'],
  [/(^|\.)akamaized\.net$|(^|\.)akamaihd\.net$/, 'Akamai', 'CDN'],
  [/(^|\.)fastly\.net$/, 'Fastly', 'CDN'],
  [/(^|\.)b-cdn\.net$/, 'Bunny CDN', 'CDN'],
  [/(^|\.)typekit\.net$|(^|\.)use\.typekit/, 'Adobe Fonts', 'Font scripts'],
  [/(^|\.)fontawesome\.com$/, 'Font Awesome', 'Font scripts'],
  [/(^|\.)vimeo\.com$|(^|\.)vimeocdn\.com$/, 'Vimeo', 'Video players'],
  [/(^|\.)wistia\.com$|(^|\.)wistia\.net$/, 'Wistia', 'Video players'],
  [/(^|\.)calendly\.com$/, 'Calendly', 'Appointment scheduling'],
  [/(^|\.)typeform\.com$/, 'Typeform', 'Form builders'],
  [/(^|\.)trustpilot\.com$/, 'Trustpilot', 'Reviews'],
  [/(^|\.)shopify\.com$|(^|\.)shopifycdn\.com$|(^|\.)myshopify\.com$/, 'Shopify', 'Ecommerce'],
  [/(^|\.)wp\.com$|(^|\.)wordpress\.com$/, 'WordPress.com / Jetpack', 'CMS'],
  [/(^|\.)gravatar\.com$/, 'Gravatar', 'Widgets'],
  [/(^|\.)elementor\.com$/, 'Elementor', 'Page builders'],
  [/(^|\.)optimizely\.com$/, 'Optimizely', 'A/B Testing'],
  [/(^|\.)vwo\.com$|(^|\.)visualwebsiteoptimizer\.com$/, 'VWO', 'A/B Testing'],
  [/(^|\.)criteo\.com$|(^|\.)criteo\.net$/, 'Criteo', 'Retargeting'],
  [/(^|\.)bing\.com$|(^|\.)clarity\.ms$/, 'Microsoft Advertising / Bing', 'Advertising'],
  [/(^|\.)snapchat\.com$|(^|\.)sc-static\.net$/, 'Snap Pixel', 'Advertising'],
  [/(^|\.)reddit\.com$|(^|\.)redditstatic\.com$/, 'Reddit Pixel', 'Advertising'],
  [/(^|\.)adroll\.com$/, 'AdRoll', 'Retargeting'],
  [/(^|\.)taboola\.com$/, 'Taboola', 'Advertising'],
  [/(^|\.)outbrain\.com$/, 'Outbrain', 'Advertising'],
  [/(^|\.)algolia\.net$|(^|\.)algolianet\.com$/, 'Algolia', 'Search engines'],
  [/(^|\.)onesignal\.com$/, 'OneSignal', 'Marketing automation'],
  [/(^|\.)usercentrics\.eu$/, 'Usercentrics', 'Cookie compliance'],
  [/(^|\.)cookie-script\.com$/, 'CookieScript', 'Cookie compliance'],
  [/(^|\.)gstatic\.com$|(^|\.)googleapis\.com$/, 'Google APIs / static', 'Miscellaneous'],
  [/(^|\.)hcaptcha\.com$/, 'hCaptcha', 'Security'],
  [/(^|\.)challenges\.cloudflare\.com$/, 'Cloudflare Turnstile', 'Security']
];

export function classifyHost(host: string): { technology: string; category: string } | null {
  for (const [re, technology, category] of VENDORS) if (re.test(host)) return { technology, category };
  return null;
}

export function summariseThirdParties(html: ParsedHtml | null, requests: BrowserRequest[] | null, pageHost: string, techs: TechnologyDetection[]): Report['thirdParties'] {
  const pageSite = parseDomain(pageHost).domain;
  const counts = new Map<string, number>();
  const bump = (h: string) => {
    if (!h || parseDomain(h).domain === pageSite) return;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  };
  if (requests) {
    for (const r of requests) if (r.thirdParty) bump(r.host);
  } else if (html) {
    for (const h of html.externalResourceHosts) bump(h);
    for (const i of html.iframes) bump(new URL(i).hostname);
  }
  const techByHost = new Map<string, TechnologyDetection>();
  for (const t of techs) for (const e of t.evidence) if (e.source === 'script-src' || (e.source === 'url' && e.key === 'xhr')) {
    try {
      techByHost.set(new URL(e.value.startsWith('http') ? e.value : 'https://' + e.value.replace(/^\/\//, '')).hostname, t);
    } catch {
      /* evidence may be a fragment */
    }
  }
  const out: Report['thirdParties'] = [];
  for (const [host, count] of counts) {
    const v = classifyHost(host);
    const t = techByHost.get(host);
    out.push({ domain: host, technology: v?.technology ?? t?.name ?? null, category: v?.category ?? t?.categories[0]?.name ?? null, count });
  }
  return out.sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain)).slice(0, 80);
}
