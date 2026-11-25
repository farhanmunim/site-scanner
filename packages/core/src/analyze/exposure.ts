import type { EolItem, Exposure, ReputationData, Finding, GeoInfo, InternetDbData, TrancoRank, VulnerableLibrary, OsvAdvisory } from '../types.js';
import type { LibraryMatch } from '../external/retire.js';

/** Services that should not answer on the public internet: databases, caches, remote desktop, container APIs. */
const EXPOSED_SERVICES: Record<number, string> = {
  21: 'FTP (unencrypted file transfer)',
  23: 'Telnet (unencrypted remote shell)',
  445: 'SMB file sharing',
  1433: 'Microsoft SQL Server',
  2375: 'Docker API (unauthenticated)',
  3306: 'MySQL',
  3389: 'Remote Desktop',
  5432: 'PostgreSQL',
  5900: 'VNC remote desktop',
  5984: 'CouchDB',
  6379: 'Redis',
  9200: 'Elasticsearch',
  9042: 'Cassandra',
  11211: 'Memcached',
  27017: 'MongoDB'
};
const WEB_PORTS = new Set([80, 443, 8080, 8443, 2052, 2053, 2082, 2083, 2086, 2087, 2095, 2096, 8880]);

const clip = (a: string[], n: number) => (a.length > n ? `${a.slice(0, n).join(', ')} and ${a.length - n} more` : a.join(', '));

/**
 * What a passive internet scanner (Shodan) already knows about the site's addresses. We never connect to the
 * target's ports ourselves: this is somebody else's earlier observation, so it can be stale.
 */
export function auditExposure(db: InternetDbData | null | undefined, opts: { sharedEdge: boolean; rank: TrancoRank | null; geo: GeoInfo | null }): Exposure | null {
  if (!db && !opts.rank && !opts.geo) return null;
  const hosts = db?.hosts ?? [];
  const findings: Finding[] = [];
  if (db) {
    const known = hosts.filter((h) => h.known);
    if (!known.length) {
      findings.push({ id: 'ports-none', title: 'Open ports', status: 'info', observed: 'No data: the public internet scanners have not indexed these addresses.', detail: 'That is common for small or new sites. It does not mean no ports are open.' });
    } else if (opts.sharedEdge) {
      const ports = [...new Set(known.flatMap((h) => h.ports))].sort((a, b) => a - b);
      findings.push({ id: 'ports-edge', title: 'Open ports', status: 'info', observed: `This site sits behind a CDN or firewall, so the open ports (${clip(ports.map(String), 12)}) belong to the provider's shared edge, not the site's own server.`, detail: 'The real server\'s ports are hidden behind the CDN, which is the point of using one.' });
    } else {
      const risky = known.flatMap((h) => h.ports.filter((p) => EXPOSED_SERVICES[p]).map((p) => ({ ip: h.ip, port: p })));
      if (risky.length) {
        findings.push({ id: 'ports-risky', title: 'Services exposed to the internet', status: 'bad', observed: risky.slice(0, 8).map((r) => `${r.ip}:${r.port} ${EXPOSED_SERVICES[r.port]}`).join('; '), detail: 'Databases, caches and remote-access services should only be reachable from a private network or VPN. Close the port at the firewall or bind the service to localhost.', owasp: 'A05', evidence: risky.slice(0, 5).map((r) => ({ source: 'ip' as const, key: 'internetdb', value: `${r.ip}:${r.port}` })) });
      } else {
        findings.push({ id: 'ports-risky', title: 'Services exposed to the internet', status: 'good', observed: 'No databases, remote-desktop or file-sharing ports seen.' });
      }
      const odd = known.flatMap((h) => h.ports.filter((p) => !WEB_PORTS.has(p) && !EXPOSED_SERVICES[p] && p !== 22 && p !== 25 && p !== 53 && p !== 587 && p !== 993 && p !== 995 && p !== 465 && p !== 143 && p !== 110));
      if (odd.length) findings.push({ id: 'ports-other', title: 'Other open ports', status: 'info', observed: `${clip([...new Set(odd)].sort((a, b) => a - b).map(String), 14)}.`, detail: 'Worth confirming each one is intended. Every open service is something that needs patching.' });
      const ssh = known.some((h) => h.ports.includes(22));
      if (ssh) findings.push({ id: 'ports-ssh', title: 'SSH reachable', status: 'info', observed: 'Port 22 is open to the internet.', detail: 'Common and fine with key-only logins. Password logins on a public SSH port attract constant guessing.' });
      const cves = [...new Set(known.flatMap((h) => h.vulns))];
      if (cves.length) {
        findings.push({ id: 'ports-cves', title: 'Known vulnerabilities (from banners)', status: 'warn', observed: `${cves.length} CVE${cves.length === 1 ? '' : 's'} associated with the software these ports advertise: ${clip(cves, 8)}.`, detail: 'The scanner infers these from version banners, so some may already be patched (distributions backport fixes without changing the version). Treat as a checklist to verify, not a confirmed finding.', owasp: 'A06' });
      } else findings.push({ id: 'ports-cves', title: 'Known vulnerabilities (from banners)', status: 'good', observed: 'None associated with the services seen.' });
    }
  }
  return { hosts, findings, sharedEdge: opts.sharedEdge, rank: opts.rank, geo: opts.geo };
}

/** Support status findings from endoflife.date. PHP is reported by the PHP section, so it is listed but not repeated as a finding. */
export function auditEol(items: EolItem[], now = new Date()): Finding[] {
  const out: Finding[] = [];
  for (const i of items) {
    if (i.product === 'php') continue;
    const name = `${i.technology} ${i.version}`;
    if (!i.supported) out.push({ id: `eol-${i.product}`, title: `${i.technology} no longer supported`, status: 'bad', observed: `${name} (release ${i.cycle}) reached end of life${i.eol && i.eol !== 'ended' ? ` on ${i.eol}` : ''}.`, detail: `Unsupported releases get no security fixes.${i.latest ? ` The latest ${i.cycle} release is ${i.latest}; a supported branch is better.` : ''}`, owasp: 'A06' });
    else if (i.eol && Date.parse(i.eol) - now.getTime() < 90 * 86_400_000) out.push({ id: `eol-${i.product}`, title: `${i.technology} support ends soon`, status: 'warn', observed: `${name} (release ${i.cycle}) reaches end of life on ${i.eol}.`, detail: 'Plan the upgrade before security fixes stop.', owasp: 'A06' });
    else out.push({ id: `eol-${i.product}`, title: `${i.technology} support`, status: 'good', observed: `${name} (release ${i.cycle}) is supported${i.eol ? ` until ${i.eol}` : ''}.` });
  }
  return out;
}

/** Fold OSV advisories into the retire.js library list (same card, one table). */
export function mergeOsv(libs: VulnerableLibrary[] | null, osv: Record<string, OsvAdvisory[]> | null | undefined, matches: LibraryMatch[]): VulnerableLibrary[] | null {
  if (!osv) return libs;
  const out = libs ? libs.map((l) => ({ ...l, vulns: [...l.vulns] })) : [];
  for (const [key, advisories] of Object.entries(osv)) {
    if (!advisories.length) continue;
    const at = key.lastIndexOf('@');
    const name = key.slice(0, at);
    const version = key.slice(at + 1);
    let lib = out.find((l) => l.name === name && l.version === version);
    if (!lib) {
      lib = { name, version, source: matches.find((m) => m.library === name && m.version === version)?.source ?? 'script', vulns: [] };
      out.push(lib);
    }
    const known = new Set(lib.vulns.flatMap((v) => v.cves));
    for (const a of advisories) {
      const cves = [a.id, ...a.aliases].filter((x) => /^CVE-/i.test(x));
      if (cves.some((c) => known.has(c))) continue;
      lib.vulns.push({ severity: a.severity, summary: a.summary ?? a.id, cves: cves.length ? cves : [a.id], below: a.fixedIn, atOrAbove: null });
    }
  }
  const withVulns = out.filter((l) => l.vulns.length);
  return libs === null && !withVulns.length ? null : withVulns;
}

/**
 * Verdicts from the threat-intelligence sources. These are other organisations' opinions, so wording stays
 * "flagged by" and a single detection from one engine is a warning, never a failure.
 */
export function auditReputation(r: ReputationData): Finding[] {
  const out: Finding[] = [];
  if (r.asked.includes('urlhaus')) {
    const u = r.urlhaus;
    if (!u) out.push({ id: 'rep-urlhaus', title: 'URLhaus (malware URLs)', status: 'unknown', observed: 'Could not be checked right now.' });
    else if (u.listed && u.urlsOnline > 0) out.push({ id: 'rep-urlhaus', title: 'URLhaus (malware URLs)', status: 'bad', observed: `${u.urlsOnline} malware-distribution URL${u.urlsOnline === 1 ? '' : 's'} on this domain currently online (${u.urlCount} on record).`, detail: 'URLhaus is run by abuse.ch and tracks URLs serving malware. This usually means the site, or part of it, has been compromised.', owasp: 'A06' });
    else if (u.listed) out.push({ id: 'rep-urlhaus', title: 'URLhaus (malware URLs)', status: 'warn', observed: `${u.urlCount} malware URL${u.urlCount === 1 ? '' : 's'} recorded in the past, none online now.`, detail: 'Past listings often mean a previous compromise that was cleaned up. Worth confirming the site is clean.' });
    else out.push({ id: 'rep-urlhaus', title: 'URLhaus (malware URLs)', status: 'good', observed: 'No malware URLs recorded for this domain.' });
  }
  if (r.asked.includes('virustotal')) {
    const v = r.virustotal;
    if (!v) out.push({ id: 'rep-virustotal', title: 'VirusTotal', status: 'unknown', observed: 'Could not be checked right now (the free tier allows few lookups a minute).' });
    else if (v.malicious >= 3) out.push({ id: 'rep-virustotal', title: 'VirusTotal', status: 'bad', observed: `${v.malicious} of ${v.engines} security engines flag this domain as malicious${v.suspicious ? `, ${v.suspicious} as suspicious` : ''}.`, detail: 'Several independent engines agree. Browsers and mail filters that use these lists may block the site.', owasp: 'A06' });
    else if (v.malicious + v.suspicious > 0) out.push({ id: 'rep-virustotal', title: 'VirusTotal', status: 'warn', observed: `${v.malicious + v.suspicious} of ${v.engines} engines flag this domain (${v.malicious} malicious, ${v.suspicious} suspicious).`, detail: 'One or two detections are often false positives, but check the VirusTotal page for which engines and why.' });
    else out.push({ id: 'rep-virustotal', title: 'VirusTotal', status: 'good', observed: `0 of ${v.engines} security engines flag this domain.${v.categories.length ? ` Categorised as ${v.categories.slice(0, 3).join(', ')}.` : ''}` });
  }
  if (r.asked.includes('abuseipdb')) {
    const a = r.abuseipdb;
    if (a === null || a === undefined) out.push({ id: 'rep-abuseipdb', title: 'AbuseIPDB', status: 'unknown', observed: 'Could not be checked right now.' });
    else if (!a.length) out.push({ id: 'rep-abuseipdb', title: 'AbuseIPDB', status: 'info', observed: 'The site is behind a CDN, so its own server address is not exposed to check.' });
    else {
      const worst = [...a].sort((x, y) => y.score - x.score)[0]!;
      const line = `${worst.ip}: abuse confidence ${worst.score}%, ${worst.reports} report${worst.reports === 1 ? '' : 's'} in 90 days${worst.isp ? ` (${worst.isp})` : ''}.`;
      if (worst.score >= 75) out.push({ id: 'rep-abuseipdb', title: 'AbuseIPDB', status: 'bad', observed: line, detail: 'The server address is widely reported for abuse (attacks, spam, scanning). On shared hosting this can reflect a neighbour rather than the site itself.', owasp: 'A06' });
      else if (worst.score >= 25) out.push({ id: 'rep-abuseipdb', title: 'AbuseIPDB', status: 'warn', observed: line, detail: 'Some abuse reports against the server address. On shared hosting this may be another customer.' });
      else out.push({ id: 'rep-abuseipdb', title: 'AbuseIPDB', status: 'good', observed: line });
    }
  }
  if (r.asked.includes('otx')) {
    const o = r.otx;
    if (!o) out.push({ id: 'rep-otx', title: 'AlienVault OTX', status: 'unknown', observed: 'Could not be checked right now.' });
    else if (o.pulses >= 5) out.push({ id: 'rep-otx', title: 'AlienVault OTX', status: 'warn', observed: `Appears in ${o.pulses} threat-intelligence collections${o.names.length ? `, for example “${o.names[0]}”` : ''}.`, detail: 'Pulses are community-written lists of suspicious indicators. Large popular domains appear in many of them harmlessly, so read the context before drawing conclusions.' });
    else if (o.pulses > 0) out.push({ id: 'rep-otx', title: 'AlienVault OTX', status: 'info', observed: `Mentioned in ${o.pulses} threat-intelligence collection${o.pulses === 1 ? '' : 's'}${o.names.length ? `: “${o.names[0]}”` : ''}.` });
    else out.push({ id: 'rep-otx', title: 'AlienVault OTX', status: 'good', observed: 'Not mentioned in any community threat reports.' });
  }
  return out;
}
