import { dohQuery, cleanTxt, type RRType } from '../doh.js';
import { inspectSpf } from './spf.js';
import { checkIp, ipVersion, reverseName } from '../ip.js';
import type { DnsRecords, IpInfo } from '../../types.js';

/** Common DKIM selectors; a hit is informational only ("DKIM appears configured"). */
const DKIM_SELECTORS = ['default', 'google', 'google2', 'selector1', 'selector2', 'k1', 'k2', 'k3', 'mail', 'dkim', 'dkim1', 'smtp', 's1', 's2', 's1024', 'sig1', 'sig2', 'cm', 'mandrill', 'mailchimp', 'pm', 'protonmail', 'protonmail2', 'zoho', 'zmail', 'mailgun', 'mg', 'sendgrid', 'ses', 'amazonses', 'fm1', 'fm2', 'fm3', 'mailjet', 'brevo', 'sendinblue', 'postmark', 'hs1', 'mte1', 'zendesk1', 'everlytickey1', 'krs'];

export interface DnsStageResult {
  records: DnsRecords;
  ips: IpInfo[];
}

async function q(name: string, type: RRType, f?: typeof fetch): Promise<{ data: string[]; ad: boolean }> {
  try {
    const r = await dohQuery(name, type, f);
    return { data: r.answers.map((a) => a.data), ad: r.ad };
  } catch {
    return { data: [], ad: false };
  }
}

export async function gatherDns(host: string, registrable: string, fetchImpl?: typeof fetch): Promise<DnsStageResult> {
  const f = fetchImpl;
  const [a, aaaa, cname, mx, ns, txt, caa, soa, dmarc, mtaSts, bimi] = await Promise.all([
    q(host, 'A', f),
    q(host, 'AAAA', f),
    q(host, 'CNAME', f),
    q(registrable, 'MX', f),
    q(registrable, 'NS', f),
    q(registrable, 'TXT', f),
    q(registrable, 'CAA', f),
    q(registrable, 'SOA', f),
    q(`_dmarc.${registrable}`, 'TXT', f),
    q(`_mta-sts.${registrable}`, 'TXT', f),
    q(`default._bimi.${registrable}`, 'TXT', f)
  ]);

  // DKIM selectors: a handful of parallel lookups; only report which returned a record.
  const dkim = await Promise.all(
    DKIM_SELECTORS.map(async (sel) => {
      const r = await q(`${sel}._domainkey.${registrable}`, 'TXT', f);
      return r.data.some((d) => /v=DKIM1|k=rsa|p=/i.test(cleanTxt(d))) ? sel : null;
    })
  );

  const mxHosts = mx.data.map((m) => (m.split(/\s+/)[1] ?? '').replace(/\.$/, '')).filter(Boolean).slice(0, 3);
  const [tlsRpt, tlsaEntries] = await Promise.all([q(`_smtp._tls.${registrable}`, 'TXT', f), Promise.all(mxHosts.map(async (h) => [h, (await q(`_25._tcp.${h}`, 'TLSA', f)).data] as const))]);
  const txtRecords = txt.data.map(cleanTxt);
  const spf = await inspectSpf(registrable, txtRecords).catch(() => null);

  const records: DnsRecords = {
    A: a.data,
    AAAA: aaaa.data,
    CNAME: cname.data.map((c) => c.replace(/\.$/, '')),
    MX: mx.data
      .map((m) => {
        const [p, ex] = m.split(/\s+/);
        return { priority: Number(p), exchange: (ex ?? '').replace(/\.$/, '') };
      })
      .sort((x, y) => x.priority - y.priority),
    NS: ns.data.map((n) => n.replace(/\.$/, '')).sort(),
    TXT: txtRecords,
    CAA: caa.data,
    SOA: soa.data[0] ?? null,
    dnssec: a.ad,
    dmarc: dmarc.data.map(cleanTxt),
    mtaSts: mtaSts.data.map(cleanTxt),
    dkimSelectors: dkim.filter((s): s is string => !!s),
    bimi: bimi.data.map(cleanTxt),
    tlsRpt: tlsRpt.data.map(cleanTxt).filter((t) => /^v=TLSRPTv1/i.test(t)),
    tlsa: Object.fromEntries(tlsaEntries.filter(([, v]) => v.length)),
    spf
  };

  const ips = await enrichIps([...records.A, ...records.AAAA], f);
  return { records, ips };
}

/**
 * ASN + org via Team Cymru's DNS service (free, no key, designed for automated lookups),
 * reverse DNS via PTR. All over DoH so it works everywhere.
 */
export async function enrichIps(ips: string[], fetchImpl?: typeof fetch): Promise<IpInfo[]> {
  const unique = [...new Set(ips)].slice(0, 8);
  return Promise.all(
    unique.map(async (ip): Promise<IpInfo> => {
      const version = ipVersion(ip) ?? 4;
      const info: IpInfo = { ip, version, asn: null, asnOrg: null, country: null, prefix: null, reverseDns: null };
      if (!checkIp(ip).ok) return info;
      const rev = reverseName(ip);
      const cymruName =
        version === 4
          ? rev?.replace(/\.in-addr\.arpa$/, '.origin.asn.cymru.com')
          : rev?.replace(/\.ip6\.arpa$/, '.origin6.asn.cymru.com');
      const [origin, ptr] = await Promise.all([cymruName ? q(cymruName, 'TXT', fetchImpl) : { data: [] }, rev ? q(rev, 'PTR', fetchImpl) : { data: [] }]);
      info.reverseDns = ptr.data[0]?.replace(/\.$/, '') ?? null;
      const line = origin.data[0] ? cleanTxt(origin.data[0]) : null;
      if (line) {
        // "13335 | 104.16.0.0/12 | US | arin | 2014-03-28"
        const [asn, prefix, country] = line.split('|').map((s) => s.trim());
        info.asn = asn ? Number(asn.split(' ')[0]) : null;
        info.prefix = prefix ?? null;
        info.country = country ?? null;
        if (info.asn) {
          const asr = await q(`AS${info.asn}.asn.cymru.com`, 'TXT', fetchImpl);
          const l2 = asr.data[0] ? cleanTxt(asr.data[0]) : null;
          // "13335 | US | arin | 2010-07-14 | CLOUDFLARENET, US"
          const org = l2?.split('|')[4]?.trim() ?? null;
          info.asnOrg = org ? org.replace(/,\s*[A-Z]{2}$/, '') : null;
        }
      }
      return info;
    })
  );
}
