/** The scanner's tools. Each one is a focused view of the same scan: the sections it shows come from the report. */
export type SectionId = 'fixes' | 'overview' | 'domain' | 'dns' | 'email' | 'spf' | 'blocklist' | 'ports' | 'tls' | 'headers' | 'seo' | 'performance' | 'ai' | 'stack' | 'php' | 'wordpress' | 'libraries' | 'subdomains' | 'privacy';

export interface Tool {
  slug: string;
  title: string;
  short: string;
  description: string;
  icon: string;
  sections: SectionId[];
  checks: string[];
  featured?: boolean;
}

export const TOOLS: Tool[] = [
  {
    slug: 'domain',
    title: 'Domain Inspector',
    short: 'Registration, expiry, nameservers, DNSSEC and certificate in one view.',
    description: 'A snapshot of the domain itself: who registered it, when it expires, whether it is locked, which nameservers answer and how old it is.',
    icon: 'globe',
    sections: ['domain'],
    checks: ['Registrar, creation date and expiry countdown', 'Transfer lock and registry status codes', 'Nameservers, DNS provider and DNSSEC', 'Domain age and first sighting in the Wayback Machine']
  },
  {
    slug: 'email',
    title: 'Email DNS Checker',
    short: 'MX, SPF, DKIM, DMARC, MTA-STS, DANE and blocklists.',
    description: 'Find out why mail from a domain lands in spam, or whether anyone can spoof it. Reads public DNS only.',
    icon: 'mail',
    sections: ['email', 'spf', 'blocklist'],
    checks: ['SPF, DKIM (common selectors), DMARC policy and reporting', 'SPF lookup budget, followed through every include', 'MTA-STS, TLS-RPT, DANE (TLSA) and BIMI', 'Mail and web server IPs on public blocklists'],
    featured: true
  },
  {
    slug: 'spf',
    title: 'SPF Inspector',
    short: 'Follow every include and count the 10-lookup limit.',
    description: 'Walks an SPF record the way a receiving server would and shows the full tree, so you can see which providers cost lookups and where the record breaks.',
    icon: 'list',
    sections: ['spf'],
    checks: ['Recursive include and redirect tree', 'DNS lookups used out of the permitted 10', 'Void lookups, loops, ptr and multiple records', 'Final qualifier and IP ranges']
  },
  {
    slug: 'blocklist',
    title: 'Blocklist Checker',
    short: 'Are your mail or web server IPs on spam blocklists?',
    description: 'Checks the IPs behind a domain against public DNS blocklists. Lists that refuse our query are reported as unavailable, never as clean.',
    icon: 'ban',
    sections: ['blocklist'],
    checks: ['Mail server (MX) IPs', 'Web server IPs (skipped behind a CDN)', 'Seven public DNS blocklists', 'Clear reporting of lists that did not answer']
  },
  {
    slug: 'ports',
    title: 'Open Ports Checker',
    short: 'Exposed databases and known CVEs, from public internet scans.',
    description: 'Shows which ports public internet scanners have seen open on a site\'s addresses, flags databases and remote-access services that should not be public, and lists CVEs tied to the software they advertise. Nothing is probed.',
    icon: 'network',
    sections: ['ports'],
    checks: ['Open ports from Shodan InternetDB (passive)', 'Exposed databases, caches and remote desktop', 'CVEs associated with advertised software', 'Server location and popularity rank']
  },
  {
    slug: 'website-health',
    title: 'Website Health Checker',
    short: 'Security headers, HTTPS, SEO and vulnerable scripts.',
    description: 'A checkup of the public page: browser security headers, certificate, SEO metadata and the JavaScript libraries it loads.',
    icon: 'shield',
    sections: ['headers', 'tls', 'seo', 'libraries'],
    checks: ['HSTS, CSP, clickjacking and MIME-sniffing headers', 'Certificate chain and TLS version', 'Title, description, structured data, robots and sitemap', 'Known-vulnerable JavaScript libraries and leaked keys'],
    featured: true
  },
  {
    slug: 'ssl',
    title: 'SSL / TLS Checker',
    short: 'Certificate chain, expiry, protocol and trust path.',
    description: 'Inspects the TLS handshake and the certificate chain presented by the server.',
    icon: 'lock',
    sections: ['tls'],
    checks: ['Leaf, intermediate and root chain', 'Days until expiry', 'Protocol, cipher and key type', 'HTTP to HTTPS redirect and HSTS']
  },
  {
    slug: 'performance',
    title: 'Performance Checker',
    short: 'Core Web Vitals and Lighthouse, mobile and real users.',
    description: 'Google PageSpeed Insights for any URL, with real Chrome user data where it exists.',
    icon: 'bolt',
    sections: ['performance'],
    checks: ['LCP, INP, CLS, TTFB', 'Lighthouse performance, accessibility, best practices, SEO', 'Page weight by resource type', 'Accessibility issues flagged by Lighthouse']
  },
  {
    slug: 'ai-readiness',
    title: 'AI Readiness Checker',
    short: 'Can ChatGPT, Claude and Perplexity find and read your site?',
    description: 'Scores the signals AI assistants rely on: crawler access, llms.txt, server-rendered text, structured data and who is behind the site.',
    icon: 'sparkle',
    sections: ['ai'],
    checks: ['robots.txt rules for 11 AI crawlers', 'llms.txt presence and structure', 'Readable text in the HTML (no JavaScript)', 'Structured data, sitemap and identity signals'],
    featured: true
  },
  {
    slug: 'wordpress',
    title: 'Platform Checker',
    short: 'What a site is built with, and WordPress vulnerabilities.',
    description: 'Identifies the CMS, shop or website builder behind a site (WordPress, Shopify, Wix, Webflow, Squarespace, Framer and more). For WordPress it also reads the version, theme and plugins and matches them against the Wordfence vulnerability database.',
    icon: 'wp',
    sections: ['wordpress'],
    checks: ['CMS, shop or website builder in use', 'WordPress core, theme and plugin versions', 'Known vulnerabilities in the installed versions (Wordfence)', 'Out-of-date and abandoned plugins (WordPress.org)', 'XML-RPC, REST API and version exposure']
  },
  {
    slug: 'php',
    title: 'PHP Version Checker',
    short: 'Which PHP a site runs, and whether it still gets security fixes.',
    description: 'Finds the PHP version from headers and fingerprints and compares it with the supported release branches.',
    icon: 'code',
    sections: ['php'],
    checks: ['Version from X-Powered-By and fingerprints', 'Detection of PHP when the version is hidden', 'End-of-security-support date for the branch', 'Version disclosure advice']
  },
  {
    slug: 'dns',
    title: 'DNS Propagation Checker',
    short: 'Compare answers from eight public resolvers.',
    description: 'Check that a DNS change has reached resolvers worldwide, and read the full record set, hosting and CDN.',
    icon: 'network',
    sections: ['dns', 'ports'],
    checks: ['A, AAAA, CNAME, MX, NS and TXT on 8 resolvers', 'Agreement across resolvers, flagged when they differ', 'All DNS records and IP ownership (ASN)', 'CDN, firewall and hosting detection']
  },
  {
    slug: 'stack',
    title: 'Technology Detector',
    short: 'CMS, frameworks, analytics, CDN and 7,600 more.',
    description: 'Identifies what a website is built with, and shows the evidence behind every detection.',
    icon: 'layers',
    sections: ['stack'],
    checks: ['Platform, framework and libraries', 'CDN, hosting and server software', 'Analytics, ads and third-party scripts', 'Confidence level and the matching header, script or markup']
  },
  {
    slug: 'js-libraries',
    title: 'JavaScript Vulnerability Scanner',
    short: 'Vulnerable libraries and leaked keys in delivered code.',
    description: 'Identifies the JavaScript libraries the page loads, checks them against the retire.js database and looks for credentials that should never reach a browser.',
    icon: 'puzzle',
    sections: ['libraries'],
    checks: ['jQuery, Angular, Bootstrap, Lodash and 150 more libraries', 'CVEs and severity for the detected versions', 'AWS, Stripe, GitHub, Slack and similar secrets', 'Redacted previews only; nothing is stored in full']
  },
  {
    slug: 'subdomains',
    title: 'Subdomain Finder',
    short: 'Hostnames from Certificate Transparency, checked against DNS.',
    description: 'Lists subdomains seen in public certificate logs and tells live hosts from retired ones. Nothing on the target is contacted.',
    icon: 'tree',
    sections: ['subdomains'],
    checks: ['Certificate Transparency log search', 'Live versus retired hostnames', 'Wildcard DNS detection', 'No probing of the target']
  },
  {
    slug: 'privacy',
    title: 'Privacy & Trackers',
    short: 'Cookies, trackers, consent and third parties.',
    description: 'What a page loads from other companies, which cookies it sets and whether there is any sign of consent handling.',
    icon: 'eye',
    sections: ['privacy'],
    checks: ['Analytics, advertising and social trackers', 'Cookies set on arrival', 'Every third-party domain and its purpose', 'AI-crawler policy in robots.txt']
  }
];

export const toolBySlug = (slug: string | null | undefined) => TOOLS.find((t) => t.slug === slug) ?? null;

export const SECTION_LABEL: Record<SectionId, string> = {
  fixes: 'What to fix',
  overview: 'Overview',
  domain: 'Domain',
  dns: 'Hosting & DNS',
  email: 'Email',
  spf: 'SPF inspector',
  blocklist: 'Blocklists',
  ports: 'Open ports',
  tls: 'HTTPS & certificate',
  headers: 'Security headers',
  seo: 'SEO',
  performance: 'Performance',
  ai: 'AI readiness',
  stack: 'Technology',
  php: 'PHP',
  wordpress: 'Platform',
  libraries: 'Scripts & secrets',
  subdomains: 'Subdomains',
  privacy: 'Privacy'
};
