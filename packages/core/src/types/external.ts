/** Browser stage (Playwright) and external enrichment sources. */
import type { Report } from './report.js';


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
  /** Shodan InternetDB: what a passive internet scan already knows about the site's IPs. */
  internetDb?: InternetDbData | null;
  /** endoflife.date release tables for the products this page appears to use; matched to detected versions at analysis time. */
  eolTables?: Record<string, EolCycle[]> | null;
  /** OSV.dev advisories for identified JavaScript libraries, keyed "name@version". */
  osv?: Record<string, OsvAdvisory[]> | null;
  /** Tranco popularity rank for the registrable domain. */
  tranco?: TrancoRank | null;
  /** Where the primary IP is (city/region), from ipwho.is. */
  geo?: GeoInfo | null;
  /** Chrome UX Report history: weekly real-user p75 values for the origin (phones). Needs the Google key with the CrUX API enabled. */
  crux?: CruxHistory | null;
  /** Threat-intelligence lookups. Each source needs its own free key; absent keys mean absent sources. */
  reputation?: ReputationData | null;
}

export interface ReputationData {
  checkedAt: string;
  virustotal?: { malicious: number; suspicious: number; harmless: number; undetected: number; engines: number; reputation: number | null; categories: string[] } | null;
  abuseipdb?: { ip: string; score: number; reports: number; lastReportedAt: string | null; usageType: string | null; isp: string | null }[] | null;
  otx?: { pulses: number; names: string[] } | null;
  urlhaus?: { listed: boolean; urlsOnline: number; urlCount: number; blacklists: string[] } | null;
  /** Sources that were configured and asked. A source in here with a null result was unavailable (rate limit, error). */
  asked: ('virustotal' | 'abuseipdb' | 'otx' | 'urlhaus')[];
}

export interface CruxPeriod {
  /** Last day of the 28-day collection window, YYYY-MM-DD. */
  end: string;
  lcpMs: number | null;
  inpMs: number | null;
  cls: number | null;
  ttfbMs: number | null;
}
export interface CruxHistory {
  origin: string;
  formFactor: 'PHONE';
  /** Oldest first. */
  periods: CruxPeriod[];
}

export interface InternetDbHost {
  ip: string;
  /** False when InternetDB has never scanned this IP (HTTP 404). */
  known: boolean;
  ports: number[];
  /** CVE ids InternetDB associates with banners it saw. Banner-derived, so they can be false positives. */
  vulns: string[];
  cpes: string[];
  hostnames: string[];
  tags: string[];
}
export interface InternetDbData {
  checkedAt: string;
  hosts: InternetDbHost[];
}
export interface EolCycle {
  cycle: string;
  eol: string | boolean;
  latest?: string;
  lts?: string | boolean;
}
export interface EolItem {
  /** Our detected technology name, e.g. "PHP". */
  technology: string;
  /** endoflife.date product slug. */
  product: string;
  version: string;
  /** Matched release cycle, e.g. "8.1". */
  cycle: string;
  /** End-of-life date, or false when no EOL is announced. */
  eol: string | false;
  /** Latest patch release of this cycle. */
  latest: string | null;
  lts: boolean;
  /** true = still supported, false = past EOL. */
  supported: boolean;
}
export interface OsvAdvisory {
  id: string;
  aliases: string[];
  summary: string | null;
  severity: string | null;
  fixedIn: string | null;
}
export interface TrancoRank {
  /** Latest rank among the top million sites, or null when not listed. */
  rank: number | null;
  /** Best rank in the returned history. */
  best: number | null;
  days: number;
}
export interface GeoInfo {
  ip: string;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
}
