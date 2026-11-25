function siteUrl(v: string | undefined): string {
  let s = (v ?? '').trim().replace(/\/$/, '');
  if (!s) return 'http://localhost:3000';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s;
}
const publicSiteUrl = siteUrl(process.env.PUBLIC_SITE_URL || process.env.SERVICE_URL_WEB || process.env.SERVICE_FQDN_WEB);
let ownHost = '';
try {
  ownHost = new URL(publicSiteUrl).hostname;
} catch {
  /* keep empty */
}

/** Blank or non-numeric values fall back to the default (an empty variable must never read as 0). */
function num(v: string | undefined, fallback: number): number {
  const n = v === undefined || v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  publicSiteUrl,
  /** Hostnames of this deployment: never scanned. */
  ownHosts: [...new Set([ownHost, ...(process.env.OWN_HOSTS ?? '').split(',').map((s) => s.trim())])].filter(Boolean),
  /** Public IPs of the VPS: never contacted by the scanner (hairpin protection). */
  ownIps: (process.env.OWN_IPS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  denySuffixes: (process.env.DENYLIST_EXTRA ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  scanConcurrency: num(process.env.SCAN_CONCURRENCY, 2),
  browserEnabled: process.env.BROWSER_ENABLED !== 'false',
  browserConcurrency: num(process.env.BROWSER_CONCURRENCY, 1),
  screenshotDir: process.env.SCREENSHOT_DIR ?? '/data/screenshots',
  pdfDir: process.env.PDF_DIR ?? (process.env.SCREENSHOT_DIR ?? '/data/screenshots') + '/pdf',
  /** Where the worker reaches the web app to render report pages for PDF export. */
  internalWebUrl: (process.env.INTERNAL_WEB_URL ?? 'http://web:3000').replace(/\/$/, ''),
  screenshotRetentionDays: num(process.env.SCREENSHOT_RETENTION_DAYS, 90),
  /** Lookups and finished scans older than this are deleted (0 = keep forever). */
  dataRetentionDays: num(process.env.DATA_RETENTION_DAYS, 365),
  ipRetentionDays: num(process.env.IP_RETENTION_DAYS, 30),
  googleApiKey: process.env.GOOGLE_API_KEY || undefined,
  wordfenceApiKey: process.env.WORDFENCE_API_KEY || undefined,
  virustotalKey: process.env.VIRUSTOTAL_API_KEY || undefined,
  abuseipdbKey: process.env.ABUSEIPDB_API_KEY || undefined,
  otxKey: process.env.OTX_API_KEY || undefined,
  urlhausKey: process.env.URLHAUS_AUTH_KEY || undefined,
  psiEnabled: process.env.PSI_ENABLED !== 'false',
  safeBrowsingEnabled: process.env.SAFE_BROWSING_ENABLED !== 'false',
  wordpressApisEnabled: process.env.WORDPRESS_APIS_ENABLED !== 'false',
  scanTimeoutMs: num(process.env.SCAN_TIMEOUT_MS, 150_000),
  workerId: process.env.HOSTNAME ? `${process.env.HOSTNAME}-${process.pid}` : `worker-${process.pid}`
};

export const SCAN_QUEUE = 'scan';
export const PDF_QUEUE = 'pdf';
