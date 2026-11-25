/** The analysed report derived from the gathered data. */
import type { Confidence, StageMeta, StageName } from './common.js';
import type { CertChainEntry, CertInfo, DnsRecords, GatheredData, HttpStageData, IpInfo, RdapData, RedirectHop, SocialPreview } from './gathered.js';
import type { Scores } from './scores.js';
import type { BlocklistData, BrowserCookie, CruxHistory, EolItem, ExternalData, GeoInfo, InternetDbHost, PropagationData, PsiMetrics, ReputationData, SafeBrowsingData, SubdomainData, TrancoRank, VulnerableLibrary } from './external.js';


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

/** The single "what is this site built with?" answer. */
export interface PlatformVerdict {
  name: string;
  kind: 'builder' | 'cms' | 'ecommerce' | 'framework';
  version: string | null;
  confidence: Confidence;
  website: string | null;
  /** The strongest piece of evidence, e.g. "meta generator: Framer". */
  evidence: string;
  alternatives: string[];
}

export interface Exposure {
  hosts: InternetDbHost[];
  findings: Finding[];
  /** The IPs belong to a CDN/WAF edge, so the ports are the edge's and not the site's own server. */
  sharedEdge: boolean;
  rank: TrancoRank | null;
  geo: GeoInfo | null;
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
    /** Time to the final response and the size of the HTML document (bytes, as delivered). */
    timingMs?: number | null;
    htmlBytes?: number | null;
  } | null;
  security: Finding[];
  email: Finding[];
  seo: SeoSummary | null;
  robots: RobotsSummary | null;
  thirdParties: { domain: string; technology: string | null; category: string | null; count: number }[];
  cms: CmsDeepDive | null;
  /** Added after reportVersion 2; absent on older stored reports until re-analysed. */
  platform?: PlatformVerdict | null;
  /** Open ports and known CVEs seen by a passive internet scanner, plus rank and location. */
  exposure?: Exposure | null;
  eol?: { items: EolItem[]; findings: Finding[] } | null;
  /** Real-user Core Web Vitals over time (Chrome UX Report). */
  fieldHistory?: CruxHistory | null;
  /** Favicon, search-result and social-card previews. */
  social?: SocialPreview | null;
  /** Threat-intelligence verdicts (VirusTotal, AbuseIPDB, AlienVault OTX, URLhaus). */
  reputation?: { data: ReputationData; findings: Finding[] } | null;
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
