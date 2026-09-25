export const config = {
  databaseUrl: process.env.DATABASE_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  publicSiteUrl: (process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  /** Hostnames of this deployment: never scanned. */
  ownHosts: (process.env.OWN_HOSTS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  /** Public IPs of the VPS: never contacted by the scanner (hairpin protection). */
  ownIps: (process.env.OWN_IPS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  denySuffixes: (process.env.DENYLIST_EXTRA ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  scanConcurrency: Number(process.env.SCAN_CONCURRENCY ?? 2),
  browserEnabled: process.env.BROWSER_ENABLED !== 'false',
  browserConcurrency: Number(process.env.BROWSER_CONCURRENCY ?? 1),
  screenshotDir: process.env.SCREENSHOT_DIR ?? '/data/screenshots',
  screenshotRetentionDays: Number(process.env.SCREENSHOT_RETENTION_DAYS ?? 90),
  ipRetentionDays: Number(process.env.IP_RETENTION_DAYS ?? 30),
  googleApiKey: process.env.GOOGLE_API_KEY || undefined,
  psiEnabled: process.env.PSI_ENABLED !== 'false',
  safeBrowsingEnabled: process.env.SAFE_BROWSING_ENABLED !== 'false',
  wordpressApisEnabled: process.env.WORDPRESS_APIS_ENABLED !== 'false',
  scanTimeoutMs: Number(process.env.SCAN_TIMEOUT_MS ?? 120_000),
  workerId: process.env.HOSTNAME ? `${process.env.HOSTNAME}-${process.pid}` : `worker-${process.pid}`
};

export const SCAN_QUEUE = 'scan';
