/** Raw data gathered server-side, stored as-is and re-analysable. */
import type { StageMeta, StageName } from './common.js';
import type { BrowserData, ExternalData } from './external.js';


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
  /** The site's own favicon and share image, as the page references them. Absent on older scans. */
  media?: { favicon: MediaFile | null; ogImage: MediaFile | null };
}

export interface MediaFile {
  /** Where the page pointed to it. */
  url: string;
  contentType: string;
  size: number;
  /** Base64 of the bytes. The worker keeps it only for the favicon; the share image is moved to a file (`path`). */
  base64?: string;
  /** File name in the screenshots volume once stored. */
  path?: string;
}

/** What the site shows in a browser tab, a search result and when its link is shared. */
export interface SocialPreview {
  title: string | null;
  description: string | null;
  url: string;
  siteName: string | null;
  favicon: { dataUrl: string | null; sourceUrl: string | null };
  og: { title: string | null; description: string | null; type: string | null; url: string | null; siteName: string | null; imageUrl: string | null; imageAlt: string | null; imageSource: string | null; imageSize: [number, number] | null };
  twitter: { card: string | null; title: string | null; description: string | null; imageUrl: string | null; site: string | null };
  /** The site's own profiles on social networks, as linked from the page (share buttons excluded). */
  profiles: { network: string; url: string }[];
  /** Plain-language gaps, e.g. "No og:image: shared links show a blank card." */
  notes: string[];
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
