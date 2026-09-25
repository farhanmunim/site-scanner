import type { Confidence, DnsRecords, Evidence, InfraSummary, IpInfo, TechnologyDetection } from '../types.js';

/**
 * Infrastructure roles: CDN ≠ WAF ≠ DNS provider ≠ hosting. Each is derived from its own
 * evidence. Hosting is the hardest: behind a CDN the origin is "not publicly detectable".
 */

/** ASN → provider. Used only when no CDN sits in front (otherwise the ASN is the CDN's). */
export const ASN_PROVIDERS: Record<number, { name: string; kind: 'cloud' | 'cdn' | 'host' }> = {
  13335: { name: 'Cloudflare', kind: 'cdn' },
  54113: { name: 'Fastly', kind: 'cdn' },
  20940: { name: 'Akamai', kind: 'cdn' },
  16625: { name: 'Akamai', kind: 'cdn' },
  16509: { name: 'Amazon Web Services', kind: 'cloud' },
  14618: { name: 'Amazon Web Services', kind: 'cloud' },
  15169: { name: 'Google Cloud', kind: 'cloud' },
  396982: { name: 'Google Cloud', kind: 'cloud' },
  8075: { name: 'Microsoft Azure', kind: 'cloud' },
  8068: { name: 'Microsoft Azure', kind: 'cloud' },
  14061: { name: 'DigitalOcean', kind: 'cloud' },
  24940: { name: 'Hetzner', kind: 'host' },
  213230: { name: 'Hetzner', kind: 'host' },
  16276: { name: 'OVHcloud', kind: 'host' },
  63949: { name: 'Linode (Akamai)', kind: 'cloud' },
  20473: { name: 'Vultr', kind: 'cloud' },
  46606: { name: 'Unified Layer (Bluehost/HostGator)', kind: 'host' },
  26496: { name: 'GoDaddy', kind: 'host' },
  398101: { name: 'GoDaddy', kind: 'host' },
  22612: { name: 'Namecheap', kind: 'host' },
  47583: { name: 'Hostinger', kind: 'host' },
  204915: { name: 'Hostinger', kind: 'host' },
  8560: { name: 'IONOS', kind: 'host' },
  32475: { name: 'SingleHop / Liquid Web', kind: 'host' },
  53824: { name: 'Liquid Web / Nexcess', kind: 'host' },
  32244: { name: 'Liquid Web', kind: 'host' },
  394695: { name: 'Pressable / WordPress.com', kind: 'host' },
  2635: { name: 'Automattic (WordPress.com)', kind: 'host' },
  62567: { name: 'DigitalOcean', kind: 'cloud' },
  40676: { name: 'Psychz Networks', kind: 'host' },
  19551: { name: 'Imperva Incapsula', kind: 'cdn' },
  60068: { name: 'Datacamp (CDN77)', kind: 'cdn' },
  212238: { name: 'Datacamp (CDN77)', kind: 'cdn' },
  200325: { name: 'Bunny.net', kind: 'cdn' },
  36459: { name: 'GitHub', kind: 'cloud' },
  54825: { name: 'Equinix Metal', kind: 'cloud' },
  40027: { name: 'Fly.io', kind: 'cloud' },
  30633: { name: 'Leaseweb', kind: 'host' },
  60781: { name: 'Leaseweb', kind: 'host' },
  197540: { name: 'netcup', kind: 'host' },
  51167: { name: 'Contabo', kind: 'host' },
  40021: { name: 'Contabo', kind: 'host' },
  45102: { name: 'Alibaba Cloud', kind: 'cloud' },
  37963: { name: 'Alibaba Cloud', kind: 'cloud' },
  132203: { name: 'Tencent Cloud', kind: 'cloud' },
  19318: { name: 'Interserver', kind: 'host' },
  29802: { name: 'HIVELOCITY', kind: 'host' },
  33438: { name: 'Highwinds (StackPath)', kind: 'cdn' },
  12876: { name: 'Scaleway', kind: 'cloud' },
  199524: { name: 'G-Core Labs', kind: 'cdn' },
  36351: { name: 'IBM Cloud (SoftLayer)', kind: 'cloud' },
  54600: { name: 'Pantheon (via Fastly/GCP)', kind: 'host' },
  394536: { name: 'Kinsta (via GCP)', kind: 'host' },
  34788: { name: 'Neue Medien Muennich (all-inkl)', kind: 'host' },
  8972: { name: 'Host Europe / GoDaddy EMEA', kind: 'host' },
  20738: { name: 'GoDaddy EMEA (123-reg/Heart)', kind: 'host' },
  25369: { name: 'Hydra Communications (UK)', kind: 'host' },
  56478: { name: 'Hyperoptic', kind: 'host' },
  201971: { name: 'Krystal', kind: 'host' },
  43350: { name: 'NForce', kind: 'host' },
  9009: { name: 'M247', kind: 'host' }
};

const CDN_CATEGORY = 31;
/** Platforms whose own edge network fronts the site: they are both host and CDN. */
const EDGE_PLATFORMS = /^(Vercel|Netlify|Cloudflare Pages|Cloudflare Workers|Render|Fly\.io|GitHub Pages|Webflow|Wix|Squarespace|Shopify|Kinsta|WP Engine|Pantheon|Flywheel|Pressable|WordPress\.com)$/;
/** Header/DNS evidence that genuinely indicates the edge in front of the document. */
const CDN_EVIDENCE_KEYS = /^(server|via|x-cache|x-served-by|cf-ray|cf-cache-status|x-amz-cf-id|x-amz-cf-pop|x-vercel-id|x-vercel-cache|x-nf-request-id|x-akamai-transformed|x-iinfo|x-cdn|x-sucuri-id|x-fastly-request-id|fastly-debug-digest|x-edgeconnect-midmile-rtt|x-github-request-id|x-azure-ref|x-ec-debug|x-bunny-cache|x-kinsta-cache|CNAME|NS)$/i;
const WAF_NAMES = /Cloudflare|Akamai|Imperva|Incapsula|Sucuri|DataDome|Wordfence|Fastly|AWS WAF|Cloudfront|Barracuda|F5|Fortinet|Kona|Reblaze|PerimeterX|HUMAN|Shield/i;

export function summariseInfra(techs: TechnologyDetection[], ips: IpInfo[], dns: DnsRecords | null, challenge: { vendor: string; evidence: string } | null): InfraSummary {
  const ev = (t: TechnologyDetection): Evidence[] => t.evidence.slice(0, 4);

  // CDN: technology in CDN category with real (non-implied) evidence, or ASN of the IPs.
  let cdn: InfraSummary['cdn'] = null;
  const cdnTech = techs.find((t) => !t.implied && t.score >= 50 && t.categories.some((c) => c.id === CDN_CATEGORY) && t.evidence.some((e) => (e.source === 'header' || e.source === 'dns') && CDN_EVIDENCE_KEYS.test(e.key ?? '')));
  if (cdnTech) cdn = { name: cdnTech.name, evidence: ev(cdnTech) };
  else {
    const asnCdn = ips.map((ip) => (ip.asn ? ASN_PROVIDERS[ip.asn] : undefined)).find((p) => p?.kind === 'cdn');
    if (asnCdn) cdn = { name: asnCdn.name, evidence: ips.filter((ip) => ip.asn && ASN_PROVIDERS[ip.asn]?.name === asnCdn.name).map((ip) => ({ source: 'ip' as const, key: `AS${ip.asn}`, value: `${ip.ip} (${ip.asnOrg ?? asnCdn.name})` })) };
  }

  // WAF: security-category tech with WAF-ish name, or an observed challenge page.
  let waf: InfraSummary['waf'] = null;
  const wafTech = techs.find((t) => !t.implied && t.categories.some((c) => c.id === 16) && WAF_NAMES.test(t.name));
  if (challenge) waf = { name: challenge.vendor, evidence: [{ source: 'html', value: challenge.evidence }] };
  else if (wafTech) waf = { name: wafTech.name, evidence: ev(wafTech) };
  else if (cdn && /Cloudflare|Akamai|Imperva|Sucuri|Fastly/i.test(cdn.name)) waf = { name: cdn.name, evidence: [{ source: 'implied', value: `${cdn.name} sits in front of the site; whether its firewall/bot protection is switched on is not observable from outside` }] };

  // DNS provider from NS records.
  let dnsProvider: InfraSummary['dnsProvider'] = null;
  const ns = dns?.NS ?? [];
  const nsMatch = (re: RegExp, name: string) => {
    const hit = ns.find((n) => re.test(n));
    if (hit && !dnsProvider) dnsProvider = { name, evidence: [{ source: 'dns', key: 'NS', value: hit }] };
  };
  nsMatch(/cloudflare\.com$/i, 'Cloudflare DNS');
  nsMatch(/awsdns/i, 'Amazon Route 53');
  nsMatch(/googledomains\.com$|google\.com$/i, 'Google Cloud DNS');
  nsMatch(/azure-dns/i, 'Azure DNS');
  nsMatch(/domaincontrol\.com$/i, 'GoDaddy DNS');
  nsMatch(/registrar-servers\.com$/i, 'Namecheap DNS');
  nsMatch(/dnsimple/i, 'DNSimple');
  nsMatch(/nsone\.net$/i, 'NS1');
  nsMatch(/ultradns/i, 'UltraDNS');
  nsMatch(/dynect|dyn\.com$/i, 'Oracle Dyn');
  nsMatch(/digitalocean\.com$/i, 'DigitalOcean DNS');
  nsMatch(/hetzner\.com$/i, 'Hetzner DNS');
  nsMatch(/ovh\.net$|anycast\.me$/i, 'OVH DNS');
  nsMatch(/linode\.com$/i, 'Linode DNS');
  nsMatch(/vercel-dns\.com$/i, 'Vercel DNS');
  nsMatch(/wixdns\.net$/i, 'Wix DNS');
  nsMatch(/squarespacedns\.com$/i, 'Squarespace DNS');
  nsMatch(/shopify/i, 'Shopify DNS');
  nsMatch(/wordpress\.com$/i, 'WordPress.com DNS');
  nsMatch(/kinsta\.cloud$/i, 'Kinsta DNS');
  nsMatch(/wpengine\.com$/i, 'WP Engine DNS');
  nsMatch(/siteground|sgvps/i, 'SiteGround DNS');
  nsMatch(/hostinger|dns-parking/i, 'Hostinger DNS');
  nsMatch(/ui-dns\./i, 'IONOS DNS');
  nsMatch(/123-reg|hosteurope|heartinternet/i, 'GoDaddy EMEA (123-reg/Heart)');
  nsMatch(/stackdns\.com$/i, '20i DNS');
  nsMatch(/krystal/i, 'Krystal DNS');
  nsMatch(/gandi\.net$/i, 'Gandi DNS');
  nsMatch(/he\.net$/i, 'Hurricane Electric DNS');
  nsMatch(/name\.com$|name-services/i, 'Name.com DNS');
  nsMatch(/porkbun/i, 'Porkbun DNS');
  nsMatch(/netlify/i, 'Netlify DNS');
  if (!dnsProvider && ns.length) dnsProvider = { name: ns[0]!.split('.').slice(-2).join('.'), evidence: [{ source: 'dns', key: 'NS', value: ns.join(', ') }] };

  // Email provider from MX.
  let emailProvider: InfraSummary['emailProvider'] = null;
  const mx = dns?.MX ?? [];
  const mxMatch = (re: RegExp, name: string) => {
    const hit = mx.find((m) => re.test(m.exchange));
    if (hit && !emailProvider) emailProvider = { name, evidence: [{ source: 'dns', key: 'MX', value: hit.exchange }] };
  };
  mxMatch(/google\.com$|googlemail\.com$/i, 'Google Workspace');
  mxMatch(/outlook\.com$|office365|protection\.outlook/i, 'Microsoft 365');
  mxMatch(/zoho/i, 'Zoho Mail');
  mxMatch(/protonmail|proton\.me/i, 'Proton Mail');
  mxMatch(/fastmail|messagingengine/i, 'Fastmail');
  mxMatch(/mimecast/i, 'Mimecast');
  mxMatch(/pphosted\.com$|proofpoint/i, 'Proofpoint');
  mxMatch(/mailgun/i, 'Mailgun');
  mxMatch(/icloud\.com$/i, 'iCloud Mail');
  mxMatch(/secureserver\.net$/i, 'GoDaddy Email');
  mxMatch(/mx\.cloudflare\.net$/i, 'Cloudflare Email Routing');
  mxMatch(/ionos|1and1|kundenserver/i, 'IONOS Mail');
  mxMatch(/emailsrvr\.com$/i, 'Rackspace Email');
  mxMatch(/yandex/i, 'Yandex Mail');
  mxMatch(/hostinger/i, 'Hostinger Email');
  mxMatch(/improvmx/i, 'ImprovMX');
  mxMatch(/forwardemail/i, 'Forward Email');
  if (!emailProvider && mx.length) emailProvider = { name: mx[0]!.exchange.split('.').slice(-2).join('.'), evidence: [{ source: 'dns', key: 'MX', value: mx.map((m) => m.exchange).join(', ') }] };

  // Hosting. Managed-host headers beat ASN; ASN is meaningless behind a CDN.
  let hosting: InfraSummary['hosting'] = null;
  const hostTech = techs.find((t) => !t.implied && t.categories.some((c) => c.id === 62 || c.id === 88) && t.score >= 50 && !/DNS$/.test(t.name));
  if (hostTech) hosting = { name: hostTech.name, confidence: hostTech.confidence, evidence: ev(hostTech) };
  if (!cdn && hostTech && EDGE_PLATFORMS.test(hostTech.name)) cdn = { name: hostTech.name, evidence: ev(hostTech) };
  else if (!cdn) {
    const provider = ips.map((ip) => ({ ip, p: ip.asn ? ASN_PROVIDERS[ip.asn] : undefined })).find((x) => x.p && x.p.kind !== 'cdn');
    if (provider?.p) hosting = { name: provider.p.name, confidence: 'medium', evidence: [{ source: 'ip', key: `AS${provider.ip.asn}`, value: `${provider.ip.ip} — ${provider.ip.asnOrg ?? provider.p.name}` }] };
    else if (ips[0]?.asnOrg) hosting = { name: ips[0].asnOrg, confidence: 'low', evidence: [{ source: 'ip', key: `AS${ips[0].asn}`, value: `${ips[0].ip}${ips[0].country ? ` (${ips[0].country})` : ''}` }] };
  } else {
    // IaaS tech with real evidence (e.g. x-amz headers leaking through a CDN)
    const iaas = techs.find((t) => !t.implied && t.categories.some((c) => c.id === 63) && t.score >= 50);
    if (iaas) hosting = { name: iaas.name, confidence: 'low', evidence: ev(iaas) };
  }

  return { cdn, waf, hosting, dnsProvider, emailProvider, originDetectable: !cdn || !!hostTech, ips };
}

export function confidenceLabel(c: Confidence): string {
  return c === 'high' ? 'High confidence' : c === 'medium' ? 'Medium confidence' : 'Low confidence';
}
