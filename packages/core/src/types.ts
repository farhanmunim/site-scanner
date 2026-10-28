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
  /** _smtp._tls.<domain> TXT (TLS-RPT). Absent on older scans. */
  tlsRpt?: string[];
  /** DANE: TLSA records for _25._tcp.<mx>, keyed by MX host. Absent on older scans. */
  tlsa?: Record<string, string[]>;
  /** Recursive SPF walk. Absent on older scans or when the domain has no SPF record. */
  spf?: SpfInspection | null;
}

export interface SpfNode {
  domain: string;
  record: string | null;
  /** How this node was reached: the root, an include:, or a redirect=. */
  via: 'root' | 'include' | 'redirect';
  /** DNS-lookup mechanisms in this record alone (include, a, mx, ptr, exists, redirect). */
  lookups: number;
  error?: string;
  children: SpfNode[];
}

export interface SpfInspection {
  tree: SpfNode;
  /** Total DNS-lookup mechanisms across the tree; RFC 7208 allows 10. */
  totalLookups: number;
  /** Lookups that returned nothing (NXDOMAIN / no data); receivers allow 2. */
  voidLookups: number;
  allQualifier: '-' | '~' | '?' | '+' | null;
  ip4Count: number;
  ip6Count: number;
  hasPtr: boolean;
  /** SPF records found at the root (more than one is a permanent error). */
  recordCount: number;
  /** Walk stopped early (depth or node cap) so totals may be low. */
  truncated: boolean;
  errors: string[];
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
    /** Focused tool this scan was run for ("full" or absent = everything). */
    scope?: string;
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
  /** "low" = kept for information only; not scored (e.g. clickjacking on a static site). */
  relevance?: 'low';
}

/** What kind of site this is; decides which checks are relevant. */
export interface SiteProfile {
  kind: 'static' | 'site' | 'cms' | 'app' | 'shop';
  /** Has logins, forms, sessions or its own API: security headers matter fully. */
  interactive: boolean;
  /** Plain-language reasons, e.g. "no forms on the homepage". */
  signals: string[];
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
  plugins: { slug: string; name: string | null; version: string | null; vulnerable?: boolean }[];
  flags: Finding[];
  /** WordPress only: latest core release and whether the detected version is behind it. */
  latestVersion?: string | null;
  vulnerabilities?: { component: 'core' | 'plugin' | 'theme'; slug: string; version: string | null; title: string; cve: string | null; cvss: number | null; fixedIn: string | null; affectsInstalled: boolean | null }[];
}

export interface PhpInfo {
  detected: boolean;
  version: string | null;
  /** How we know: the X-Powered-By header, a .php URL, a PHPSESSID cookie, or a fingerprint. */
  source: 'header' | 'fingerprint' | 'url' | 'cookie' | null;
  /** Release branch such as "8.1". */
  branch: string | null;
  /** End of security support (ISO date) for the branch, when known. */
  eol: string | null;
  supported: boolean | null;
  findings: Finding[];
}

export interface AiReadiness {
  /** 0-100 from the items below. */
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  items: { id: string; title: string; status: FindingStatus; observed: string; detail?: string; points: number; max: number }[];
  wordCount: number;
  crawlersBlocked: number;
  crawlersChecked: number;
  llmsTxt: { present: boolean; hasTitle: boolean; links: number } | null;
}

export interface ExposedSecret {
  kind: string;
  /** Redacted match: the first and last characters only. */
  preview: string;
  source: string;
  severity: 'high' | 'medium' | 'low';
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
  /** Added after reportVersion 2; absent on older stored reports until re-analysed. */
  php?: PhpInfo | null;
  aiReadiness?: AiReadiness | null;
  vulnerableLibraries?: VulnerableLibrary[] | null;
  exposedSecrets?: ExposedSecret[];
  domainChecks?: Finding[];
  blocklists?: BlocklistData | null;
  propagation?: PropagationData | null;
  cookies: BrowserCookie[];
  privacy: Finding[];
  performance: PsiMetrics | null;
  screenshot: { url: string; width: number; height: number } | { dataUrl: string } | null;
  safeBrowsing: SafeBrowsingData | null;
  tls: { protocol: string | null; alpn: string | null; authorized: boolean; authorizationError: string | null; source: string; cipher?: string | null; chain?: CertChainEntry[] } | null;
  external: { wayback: string | null; greenHosting: ExternalData['greenHosting']; subdomains?: SubdomainData | null };
  /** Added in reportVersion 2; older stored reports get it computed at read time. */
  scores?: Scores;
  profile?: SiteProfile;
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
  /** Which public source answered: crt.sh and Certspotter read Certificate Transparency logs; HackerTarget is a passive DNS database. */
  source: 'ct-log' | 'certspotter' | 'hackertarget';
  /** Distinct hostnames, wildcard entries stripped of the leading "*.", sorted. */
  names: string[];
  /** Total distinct names before the cap. */
  total: number;
  /**
   * Names from `names` that currently resolve in DNS. Certificate logs keep every name that ever had a
   * certificate, so retired hosts stay in `names`; this is the subset that is still live. Absent on
   * older reports, and when `wildcard` is set (everything resolves, so nothing can be told apart).
   */
  live?: string[];
  /** The domain has a wildcard DNS record, so resolving says nothing about whether a name is real. */
  wildcard?: boolean;
  /** How many of `names` could not be verified (resolver timeout or error) and are not in `live`. */
  unverified?: number;
}

export interface PropagationResolver {
  name: string;
  ip: string;
}
export interface PropagationRow {
  type: 'A' | 'AAAA' | 'MX' | 'NS' | 'TXT' | 'CNAME';
  /** One entry per resolver; null = no answer or error. */
  answers: { resolver: PropagationResolver; values: string[] | null }[];
  /** Every resolver that answered returned the same set. */
  consistent: boolean;
  /** Set when the answers cannot be trusted (for example every resolver returned nothing while DNS-over-HTTPS sees records). */
  note?: string;
}
export interface PropagationData {
  checkedAt: string;
  host: string;
  rows: PropagationRow[];
}

export interface BlocklistHit {
  list: string;
  /** What was listed: an IP, with the role we found it in. */
  subject: string;
  role: 'web' | 'mail';
  code: string;
}
export interface BlocklistData {
  checkedAt: string;
  /** IPs we queried, with role. */
  checked: { ip: string; role: 'web' | 'mail' }[];
  lists: string[];
  listed: BlocklistHit[];
  /** Lists that refused or rate-limited us (cannot say either way). */
  unavailable: string[];
}

export interface WordfenceVuln {
  title: string;
  cve: string | null;
  cvss: number | null;
  /** Inclusive/exclusive version ranges this advisory affects. */
  ranges: { from: string | null; fromInclusive: boolean; to: string | null; toInclusive: boolean }[];
  patched: string[];
  patchedFlag: boolean;
}

export interface RetireVuln {
  severity: string | null;
  summary: string | null;
  cves: string[];
  below: string | null;
  atOrAbove: string | null;
}
export interface RetireLibrary {
  name: string;
  vulns: { atOrAbove?: string; below?: string; severity?: string; cve?: string[]; summary?: string }[];
  uri: string[];
  filename: string[];
  filecontent: string[];
}
export interface VulnerableLibrary {
  name: string;
  version: string;
  /** Script URL or "inline" it was identified from. */
  source: string;
  vulns: RetireVuln[];
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
  /** Version-aware advisories keyed "plugin:slug", "theme:slug" or "core:wordpress". */
  wordfenceVulns?: Record<string, WordfenceVuln[]>;
  /** Latest stable WordPress release from api.wordpress.org. */
  wordpressLatest?: string | null;
  wordpressThemes?: Record<string, { name: string; version: string | null; lastUpdated: string | null }>;
  blocklists?: BlocklistData | null;
  propagation?: PropagationData | null;
  /** retire.js repository entries trimmed to libraries that appear on this page. */
  retire?: RetireLibrary[] | null;
}
