// Shared types for the scanner. Kept dependency-free so both the Worker (gather side)
// and the browser (analyze side) can import them.

export const SCANNER_VERSION = '0.1.0';
export const REPORT_VERSION = 2;

export type Confidence = 'high' | 'medium' | 'low';

export type StageName = 'dns' | 'http' | 'files' | 'rdap' | 'cert' | 'browser' | 'external';
export const STAGE_ORDER: StageName[] = ['dns', 'http', 'files', 'rdap', 'cert', 'browser', 'external'];

/** Outcome of a single gather stage. "restricted" = target blocked us; never retried. */
export type StageStatus = 'pending' | 'complete' | 'restricted' | 'failed' | 'skipped';

export interface StageMeta {
  status: StageStatus;
  startedAt?: string;
  durationMs?: number;
  /** Human-readable reason for restricted/failed/skipped. */
  note?: string;
}

// ---------------------------------------------------------------------------
// Gathered (raw, server-side) data — stored in D1 as-is.
// ---------------------------------------------------------------------------

export interface DnsRecords {
  A: string[];
  AAAA: string[];
  CNAME: string[];
  MX: { priority: number; exchange: string }[];
  NS: string[];
  TXT: string[];
  CAA: string[];
  SOA: string | null;
  /** DNSSEC: the resolver set the AD (authenticated data) flag on the A lookup. */
  dnssec: boolean;
  /** Registrable-domain TXT lookups used for email auth. */
  dmarc: string[];
  mtaSts: string[];
  /** DKIM selectors that returned a record (common selectors only). */
  dkimSelectors: string[];
  /** _bimi.<domain> TXT */
  bimi: string[];
}

export interface IpInfo {
  ip: string;
  version: 4 | 6;
  asn: number | null;
  asnOrg: string | null;
  country: string | null;
  prefix: string | null;
  reverseDns: string | null;
}

export interface RedirectHop {
  url: string;
  status: number;
  location?: string;
}

export interface HttpResponseInfo {
  url: string;
  status: number;
  /** Lower-cased header names. Multiple values joined with ", ". */
  headers: Record<string, string>;
  /** Set-Cookie headers, with values redacted (name + attributes only). */
  cookies: string[];
  contentType: string | null;
  contentLength: number | null;
  /** HTML body, capped at MAX_HTML_BYTES. */
  body: string;
  bodyTruncated: boolean;
  protocol: string | null;
  timingMs: number;
}

export interface HttpStageData {
  /** What we requested first (normalised). */
  requestedUrl: string;
  chain: RedirectHop[];
  final: HttpResponseInfo | null;
  /** If http:// was requested first, did it redirect to https? */
  httpsRedirect: boolean | null;
  /** True if a bot challenge / WAF block page was recognised. */
  challenge: { vendor: string; evidence: string } | null;
  /** Why no final response was obtained (policy refusal, network error, redirect loop). */
  error: string | null;
}

export interface FetchedFile {
  path: string;
  status: number;
  contentType: string | null;
  body: string | null;
  truncated: boolean;
}

export interface FilesStageData {
  robots: FetchedFile | null;
  sitemap: FetchedFile | null;
  securityTxt: FetchedFile | null;
  adsTxt: FetchedFile | null;
  llmsTxt: FetchedFile | null;
  /** First N external/same-origin scripts fetched for deeper fingerprinting. */
  scripts: FetchedFile[];
  /** CMS-specific public files (theme style.css, plugin readme.txt, wp-json root). */
  cms: FetchedFile[];
}

export interface RdapData {
  registrar: string | null;
  created: string | null;
  updated: string | null;
  expires: string | null;
  status: string[];
  nameservers: string[];
  dnssecSigned: boolean | null;
  raw?: unknown;
}

export interface CertInfo {
  issuer: string | null;
  subject: string | null;
  notBefore: string | null;
  notAfter: string | null;
  sans: string[];
  source: 'ct-log' | 'handshake';
}

/** One certificate in the chain presented during the handshake (leaf first). */
export interface CertChainEntry {
  subject: string | null;
  issuer: string | null;
  notBefore: string | null;
  notAfter: string | null;
  keyType: 'RSA' | 'EC' | null;
  keyBits: number | null;
  curve: string | null;
  selfSigned: boolean;
}

// ---------------------------------------------------------------------------
// Scores: transparent points-based, see analyze/score.ts.

export type ScoreSectionId = 'headers' | 'tls' | 'performance' | 'seo' | 'email' | 'privacy';
export interface ScorePenalty {
  findingId: string;
  title: string;
  status: FindingStatus;
  points: number;
}
export interface SectionScore {
  id: ScoreSectionId;
  label: string;
  /** 0–100, or null when the section was not assessed (excluded from the overall). */
  score: number | null;
  weight: number;
  penalties: ScorePenalty[];
  note?: string;
}
export interface Scores {
  version: 1;
  overall: number | null;
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null;
  summary: string;
  sections: SectionScore[];
}

export interface GatheredData {
  target: {
    input: string;
    url: string; // normalised URL we scanned
    host: string; // ascii hostname
    displayHost: string; // unicode
    registrableDomain: string;
    isSubdomain: boolean;
  };
  scan: {
    id: string;
    createdAt: string;
    scannerVersion: string;
    fingerprintsVersion: string | null;
  };
  stages: Record<StageName, StageMeta>;
  dns?: DnsRecords;
  ips?: IpInfo[];
  http?: HttpStageData;
  files?: FilesStageData;
  rdap?: RdapData | null;
  cert?: CertInfo | null;
  browser?: BrowserData | null;
  external?: ExternalData;
}

// ---------------------------------------------------------------------------
// Analysed report (derived in the browser or by the CLI from GatheredData).
// ---------------------------------------------------------------------------

export type EvidenceSource =
  | 'header'
  | 'cookie'
  | 'html'
  | 'meta'
  | 'script-src'
  | 'script-content'
  | 'url'
  | 'dns'
  | 'dom'
  | 'cert'
  | 'text'
  | 'implied'
  | 'ip'
  | 'file';

export interface Evidence {
  source: EvidenceSource;
  /** e.g. header name, meta name, DNS record type, file path */
  key?: string;
  /** The (trimmed) matched value. */
  value: string;
  /** The signature pattern that matched, for transparency. */
  pattern?: string;
}

export interface TechnologyDetection {
  name: string;
  slug: string;
  categories: { id: number; name: string }[];
  confidence: Confidence;
  /** 0–100 internal score */
  score: number;
  version: string | null;
  website: string | null;
  description: string | null;
  evidence: Evidence[];
  /** Detected only because another technology implies it. */
  implied: boolean;
  oss?: boolean;
  saas?: boolean;
}

export type FindingStatus = 'good' | 'warn' | 'bad' | 'info' | 'unknown' | 'na';

export interface Finding {
  id: string;
  title: string;
  status: FindingStatus;
  /** What was observed, factual. */
  observed: string;
  /** Plain-language explanation / recommendation. Never legal conclusions. */
  detail?: string;
  /** OWASP Top 10 (2021) tag e.g. "A05" */
  owasp?: string;
  evidence?: Evidence[];
}

export interface InfraSummary {
  cdn: { name: string; evidence: Evidence[] } | null;
  waf: { name: string; evidence: Evidence[] } | null;
  hosting: { name: string; confidence: Confidence; evidence: Evidence[] } | null;
  dnsProvider: { name: string; evidence: Evidence[] } | null;
  emailProvider: { name: string; evidence: Evidence[] } | null;
  originDetectable: boolean;
  ips: IpInfo[];
}

export interface SeoSummary {
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  canonical: string | null;
  robotsMeta: string | null;
  lang: string | null;
  viewport: string | null;
  charset: string | null;
  h1: string[];
  headingCounts: Record<string, number>;
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
  images: { total: number; missingAlt: number };
  links: { internal: number; external: number; nofollow: number };
  structuredData: { types: string[]; jsonLdCount: number; microdata: boolean; errors: string[] };
  favicon: string | null;
  manifest: string | null;
  hreflang: string[];
  findings: Finding[];
}

export interface RobotsSummary {
  present: boolean;
  sitemaps: string[];
  /** Rules for the wildcard agent. */
  disallowAll: boolean;
  aiCrawlers: { agent: string; blocked: boolean }[];
  groups: number;
}

export interface CmsDeepDive {
  platform: 'wordpress' | 'shopify' | 'webflow' | 'wix' | 'squarespace';
  version: string | null;
  theme: { slug: string; name: string | null; version: string | null; author: string | null } | null;
  plugins: { slug: string; name: string | null; version: string | null }[];
  flags: Finding[];
}

export interface Report {
  reportVersion: number;
  analyzedAt: string;
  target: GatheredData['target'];
  scan: GatheredData['scan'] & { quality: 'complete' | 'partial' | 'restricted' | 'failed' };
  stages: Record<StageName, StageMeta>;
  technologies: TechnologyDetection[];
  infra: InfraSummary;
  dns: DnsRecords | null;
  domain: RdapData | null;
  cert: CertInfo | null;
  http: {
    finalUrl: string | null;
    status: number | null;
    chain: RedirectHop[];
    server: string | null;
    poweredBy: string | null;
    protocol: string | null;
    compression: string | null;
    http3: boolean;
    cacheHeaders: Record<string, string>;
    challenge: HttpStageData['challenge'];
  } | null;
  security: Finding[];
  email: Finding[];
  seo: SeoSummary | null;
  robots: RobotsSummary | null;
  thirdParties: { domain: string; technology: string | null; category: string | null; count: number }[];
  cms: CmsDeepDive | null;
  wellKnown: { securityTxt: boolean; adsTxt: boolean; llmsTxt: boolean };
  cookies: BrowserCookie[];
  privacy: Finding[];
  performance: PsiMetrics | null;
  screenshot: { url: string; width: number; height: number } | { dataUrl: string } | null;
  safeBrowsing: SafeBrowsingData | null;
  tls: { protocol: string | null; alpn: string | null; authorized: boolean; authorizationError: string | null; source: string; cipher?: string | null; chain?: CertChainEntry[] } | null;
  external: { wayback: string | null; greenHosting: ExternalData['greenHosting']; subdomains?: SubdomainData | null };
  /** Added in reportVersion 2; older stored reports get it computed at read time. */
  scores?: Scores;
}

// ---------------------------------------------------------------------------
// Browser stage (Playwright) and external enrichment APIs.
// ---------------------------------------------------------------------------

export interface BrowserCookie {
  name: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'Strict' | 'Lax' | 'None' | null;
  /** Session cookie if no expiry. */
  session: boolean;
  thirdParty: boolean;
}

export interface BrowserRequest {
  url: string;
  host: string;
  type: string; // document, script, stylesheet, image, xhr, fetch, font, media, other
  status: number | null;
  thirdParty: boolean;
}

export interface BrowserData {
  finalUrl: string;
  title: string | null;
  renderedHtml: string;
  renderedTruncated: boolean;
  /** Results of evaluating fingerprint `js` property paths in the page: path -> stringified value. */
  jsGlobals: Record<string, string>;
  requests: BrowserRequest[];
  cookies: BrowserCookie[];
  /** Relative path (under SCREENSHOT_DIR) or null. */
  screenshot: { path: string; width: number; height: number } | null;
  consoleErrors: number;
  mixedContent: number;
  loadMs: number;
  userAgent: string;
  viewport: { width: number; height: number };
  blocked: { vendor: string; evidence: string } | null;
}

export interface PsiMetrics {
  strategy: 'mobile' | 'desktop';
  fetchedAt: string;
  lighthouseVersion: string | null;
  scores: { performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null };
  lab: { lcpMs: number | null; cls: number | null; tbtMs: number | null; fcpMs: number | null; speedIndexMs: number | null; ttiMs: number | null; ttfbMs?: number | null };
  field: { lcpMs: number | null; cls: number | null; inpMs: number | null; ttfbMs: number | null; overall: string | null } | null;
  /** base64 JPEG/WebP data URL of the final screenshot from Lighthouse. */
  screenshotDataUrl: string | null;
  accessibilityIssues: { id: string; title: string; count: number }[];
  totalBytes: number | null;
  requestCount: number | null;
  /** Transfer size by resource type (bytes). Null when Lighthouse did not report it. */
  breakdown?: { scriptBytes: number | null; imageBytes: number | null; fontBytes: number | null; stylesheetBytes: number | null; documentBytes: number | null; thirdPartyBytes: number | null; otherBytes: number | null } | null;
}

export interface SubdomainData {
  checkedAt: string;
  source: 'ct-log';
  /** Distinct hostnames, wildcard entries stripped of the leading "*.", sorted. */
  names: string[];
  /** Total distinct names before the cap. */
  total: number;
}

export interface SafeBrowsingData {
  checkedAt: string;
  threats: string[]; // e.g. MALWARE, SOCIAL_ENGINEERING
}

export interface ExternalData {
  psi?: PsiMetrics | null;
  safeBrowsing?: SafeBrowsingData | null;
  wayback?: { firstSeen: string | null } | null;
  greenHosting?: { green: boolean; hostedBy: string | null } | null;
  /** Hostnames seen in Certificate Transparency logs for the registrable domain (passive). */
  subdomains?: SubdomainData | null;
  wordpressOrg?: Record<string, { name: string; version: string | null; lastUpdated: string | null; activeInstalls: number | null; tested: string | null }>;
  wordfence?: Record<string, { count: number; latestTitle: string | null; affectedBelow: string | null }>;
}
