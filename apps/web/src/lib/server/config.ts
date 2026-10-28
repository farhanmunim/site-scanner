import { createHash } from 'node:crypto';

// process.env rather than $env/dynamic/private: SvelteKit hides PUBLIC_* names from the private
// env module, and PUBLIC_SITE_URL is the one variable everyone sets.
const env = process.env;

/** Accept "scanner.example.com" or "https://scanner.example.com/" and return "https://scanner.example.com". */
function siteUrl(v: string | undefined): string {
  let s = (v ?? '').trim().replace(/\/$/, '');
  if (!s) return 'http://localhost:3000';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s;
}
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
/** Derive a stable secret when none is configured, so a single-owner deploy needs no extra env vars. */
function derived(purpose: string, ...seeds: (string | undefined)[]): string {
  return createHash('sha256').update([purpose, ...seeds.map((s) => s ?? '')].join('\u0000')).digest('hex');
}

const publicSiteUrl = siteUrl(env.PUBLIC_SITE_URL || env.SERVICE_URL_WEB || env.SERVICE_FQDN_WEB);
const adminPassword = env.ADMIN_PASSWORD ?? '';
const dbPassword = env.POSTGRES_PASSWORD ?? env.SERVICE_PASSWORD_POSTGRES ?? '';

export const config = {
  databaseUrl: env.DATABASE_URL ?? '',
  redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
  publicSiteUrl,
  ownHosts: [...new Set([hostOf(publicSiteUrl), ...(env.OWN_HOSTS ?? '').split(',').map((s) => s.trim())])].filter(Boolean),
  denySuffixes: (env.DENYLIST_EXTRA ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  sessionSecret: env.SESSION_SECRET || env.SERVICE_PASSWORD_SESSION || derived('session', adminPassword, dbPassword),
  /** Simple mode: ADMIN_USERNAME + ADMIN_PASSWORD. Advanced: ADMIN_PASSWORD_HASH from scripts/hash-password.mjs. */
  adminUsername: (env.ADMIN_USERNAME ?? 'admin').trim(),
  adminEmail: (env.ADMIN_EMAIL ?? '').trim(),
  adminPassword,
  adminPasswordHash: env.ADMIN_PASSWORD_HASH ?? '',
  adminTotpSecret: env.ADMIN_TOTP_SECRET ?? '',
  turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? '',
  turnstileSecret: env.TURNSTILE_SECRET_KEY ?? '',
  ipHashSalt: env.IP_HASH_SALT || env.SERVICE_PASSWORD_IPSALT || derived('ip-salt', adminPassword, dbPassword),
  screenshotDir: env.SCREENSHOT_DIR ?? '/data/screenshots',
  pdfDir: env.PDF_DIR ?? (env.SCREENSHOT_DIR ?? '/data/screenshots') + '/pdf',
  /** Trust Cloudflare's CF-Connecting-IP header (safe when the site is proxied through Cloudflare). */
  /** Optional: value of an `X-Origin-Secret` header that your Cloudflare Transform Rule adds; when set, CF-Connecting-IP is trusted only with it. */
  originSecret: env.ORIGIN_SECRET ?? '',
  behindCloudflare: env.BEHIND_CLOUDFLARE !== 'false',
  maxQueueDepth: Number(env.MAX_QUEUE_DEPTH ?? 20),
  /** Public contact shown on /bot and /privacy. Only ever ABUSE_CONTACT; the admin email is never published. */
  abuseContact: (env.ABUSE_CONTACT ?? '').trim(),
  siteName: env.SITE_NAME ?? 'Site Scan',
  /** Optional self-hosted Umami analytics for the scanner's own pages. */
  umamiScriptUrl: env.UMAMI_SCRIPT_URL ?? '',
  umamiWebsiteId: env.UMAMI_WEBSITE_ID ?? ''
};

export const SCAN_QUEUE = 'scan';
