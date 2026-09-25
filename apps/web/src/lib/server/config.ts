import { env } from '$env/dynamic/private';

export const config = {
  databaseUrl: env.DATABASE_URL ?? '',
  redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
  publicSiteUrl: (env.PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  ownHosts: (env.OWN_HOSTS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  denySuffixes: (env.DENYLIST_EXTRA ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  sessionSecret: env.SESSION_SECRET ?? '',
  adminPasswordHash: env.ADMIN_PASSWORD_HASH ?? '',
  adminTotpSecret: env.ADMIN_TOTP_SECRET ?? '',
  turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? '',
  turnstileSecret: env.TURNSTILE_SECRET_KEY ?? '',
  ipHashSalt: env.IP_HASH_SALT ?? env.SESSION_SECRET ?? 'change-me',
  screenshotDir: env.SCREENSHOT_DIR ?? '/data/screenshots',
  /** Trust Cloudflare's CF-Connecting-IP header (only safe when the firewall allows Cloudflare IPs only). */
  behindCloudflare: env.BEHIND_CLOUDFLARE !== 'false',
  maxQueueDepth: Number(env.MAX_QUEUE_DEPTH ?? 20),
  abuseContact: env.ABUSE_CONTACT ?? '',
  siteName: env.SITE_NAME ?? 'Site Scanner'
};

export const SCAN_QUEUE = 'scan';
