#!/usr/bin/env tsx
// Local scan without the web app: pnpm scan https://example.com [--json] [--no-external]
import { randomUUID } from 'node:crypto';
import { gather, prepareTarget, ScanRefused } from './gather/index.js';
import { analyse, loadFingerprints } from './analyze/index.js';
import type { Report } from './types.js';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
if (!url) {
  console.error('Usage: pnpm scan <url> [--json] [--no-external]');
  process.exit(1);
}
const json = args.includes('--json');
const noExternal = args.includes('--no-external');

try {
  const target = prepareTarget(url, {});
  const { version } = loadFingerprints();
  const started = Date.now();
  const data = await gather(target, {
    scanId: randomUUID(),
    selfUrl: process.env.PUBLIC_SITE_URL ?? 'https://site-scanner.local',
    fingerprintsVersion: version,
    external: noExternal ? { psi: false, safeBrowsing: false, wordpress: false, wayback: false, greenWeb: false, subdomains: false, retire: false, blocklists: false, propagation: false } : { googleApiKey: process.env.GOOGLE_API_KEY },
    onStage: (stage, d) => {
      if (!json) console.error(`  ${stage.padEnd(9)} ${d.stages[stage].status}${d.stages[stage].note ? ` — ${d.stages[stage].note}` : ''}`);
    }
  });
  const report = analyse(data);
  if (json) {
    console.log(JSON.stringify({ report, gathered: { ...data, http: data.http ? { ...data.http, final: data.http.final ? { ...data.http.final, body: `<${data.http.final.body.length} bytes>` } : null } : undefined, files: undefined } }, null, 2));
  } else {
    printReport(report, Date.now() - started);
  }
} catch (e) {
  if (e instanceof ScanRefused) {
    console.error(`Refused: ${e.message}`);
    process.exit(2);
  }
  throw e;
}

function printReport(r: Report, ms: number) {
  const line = (s = '') => console.log(s);
  line(`\n${r.target.displayHost}  (${r.scan.quality}, ${(ms / 1000).toFixed(1)}s)`);
  line('─'.repeat(60));
  line('Technology');
  for (const t of r.technologies.slice(0, 40)) {
    line(`  ${t.name.padEnd(28)} ${t.categories[0]?.name.padEnd(22) ?? ''} ${t.confidence}${t.version ? ` v${t.version}` : ''}${t.implied ? ' (implied)' : ''}`);
    for (const e of t.evidence.slice(0, 2)) line(`      · ${e.source}${e.key ? `[${e.key}]` : ''}: ${e.value.slice(0, 90)}`);
  }
  line();
  line('Infrastructure');
  line(`  CDN        ${r.infra.cdn?.name ?? 'none observed'}`);
  line(`  WAF        ${r.infra.waf?.name ?? 'none observed'}`);
  line(`  Hosting    ${r.infra.hosting ? `${r.infra.hosting.name} (${r.infra.hosting.confidence})` : r.infra.cdn ? 'not publicly detectable (behind CDN)' : 'unknown'}`);
  line(`  DNS        ${r.infra.dnsProvider?.name ?? '?'}`);
  line(`  Email      ${r.infra.emailProvider?.name ?? 'none'}`);
  for (const ip of r.infra.ips) line(`  IP         ${ip.ip}  AS${ip.asn ?? '?'} ${ip.asnOrg ?? ''} ${ip.country ?? ''} ${ip.reverseDns ?? ''}`);
  if (r.domain) line(`  Domain     registrar=${r.domain.registrar ?? '?'} created=${r.domain.created?.slice(0, 10) ?? '?'} expires=${r.domain.expires?.slice(0, 10) ?? '?'}`);
  if (r.cert) line(`  TLS        ${r.tls?.protocol ?? ''} ${r.cert.issuer ?? '?'} exp ${r.cert.notAfter?.slice(0, 10)} ${r.tls?.authorized ? 'valid' : r.tls?.authorizationError}`);
  line();
  line('Security');
  for (const f of r.security) line(`  [${f.status.padEnd(5)}] ${f.title}: ${f.observed}`);
  line();
  line('Email');
  for (const f of r.email) line(`  [${f.status.padEnd(5)}] ${f.title}: ${f.observed.slice(0, 100)}`);
  line();
  if (r.seo) {
    line('SEO');
    for (const f of r.seo.findings) line(`  [${f.status.padEnd(5)}] ${f.title}: ${f.observed.slice(0, 100)}`);
    line();
  }
  if (r.cms) {
    line(`CMS deep dive: ${r.cms.platform} ${r.cms.version ?? ''}`);
    if (r.cms.theme) line(`  Theme      ${r.cms.theme.name ?? r.cms.theme.slug} ${r.cms.theme.version ?? ''}`);
    for (const p of r.cms.plugins) line(`  Plugin     ${(p.name ?? p.slug).padEnd(40)} ${p.version ?? ''}`);
    for (const f of r.cms.flags) line(`  [${f.status.padEnd(5)}] ${f.title}: ${f.observed.slice(0, 100)}`);
    line();
  }
  line('Third parties');
  for (const t of r.thirdParties.slice(0, 20)) line(`  ${t.domain.padEnd(36)} ${t.technology ?? ''} ${t.category ? `(${t.category})` : ''}`);
  if (r.performance) {
    line();
    line(`Performance (PSI ${r.performance.strategy}): perf=${r.performance.scores.performance} a11y=${r.performance.scores.accessibility} seo=${r.performance.scores.seo} LCP=${r.performance.lab.lcpMs}ms CLS=${r.performance.lab.cls}`);
  }
  line();
  line('Stages');
  for (const [k, v] of Object.entries(r.stages)) line(`  ${k.padEnd(9)} ${v.status}${v.durationMs ? ` ${v.durationMs}ms` : ''}${v.note ? ` — ${v.note}` : ''}`);
}
