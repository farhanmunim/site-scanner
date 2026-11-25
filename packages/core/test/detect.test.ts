import { describe, expect, it } from 'vitest';
import { compilePattern, detectTechnologies, loadFingerprints, resolveVersion } from '../src/analyze/detect/index.js';
import { parseHtml } from '../src/analyze/html.js';
import { analyse } from '../src/analyze/index.js';
import { gradeCsp } from '../src/analyze/audits/security.js';
import { detectChallenge } from '../src/gather/stages/http.js';
import type { GatheredData } from '../src/types.js';

const { db, categories } = loadFingerprints();

function input(html: string, headers: Record<string, string> = {}, url = 'https://example.com/') {
  const p = parseHtml(html, url);
  return { url, headers, cookies: [], html, scriptSrc: p.scriptSrc, scripts: {}, meta: p.meta, dns: {}, dom: p.dom };
}

describe('pattern compiler', () => {
  it('parses confidence and version', () => {
    const p = compilePattern('^WordPress(?: ([\\d.]+))?\\;confidence:50\\;version:\\1');
    expect(p.confidence).toBe(50);
    expect(p.version).toBe('\\1');
    expect(resolveVersion(p.version, p.regex!.exec('WordPress 6.8.2'))).toBe('6.8.2');
  });
  it('handles ternary version templates', () => {
    const m = /jquery-(\d+\.\d+)?/.exec('jquery-3.6');
    expect(resolveVersion('\\1?\\1:unknown', m)).toBe('3.6');
    expect(resolveVersion('\\1?\\1:unknown', /jquery-(\d+\.\d+)?/.exec('jquery-'))).toBe('unknown');
  });
});

describe('detection engine', () => {
  it('detects WordPress with evidence and version', () => {
    const html = `<html><head><meta name="generator" content="WordPress 6.8.2"><link rel="stylesheet" href="/wp-content/themes/astra/style.css?ver=4.8"><script src="/wp-includes/js/jquery/jquery-3.7.1.min.js"></script></head><body></body></html>`;
    const techs = detectTechnologies(input(html, { 'x-pingback': 'https://example.com/xmlrpc.php', link: '<https://example.com/wp-json/>; rel="https://api.w.org/"' }), db, categories);
    const wp = techs.find((t) => t.name === 'WordPress')!;
    expect(wp).toBeDefined();
    expect(wp.confidence).toBe('high');
    expect(wp.version).toBe('6.8.2');
    expect(wp.evidence.map((e) => e.source)).toEqual(expect.arrayContaining(['meta', 'header']));
    expect(techs.find((t) => t.name === 'PHP')?.implied).toBe(true);
    expect(techs.find((t) => t.name === 'jQuery')?.version).toBe('3.7.1');
  });
  it('detects Next.js and React from headers/markup', () => {
    const html = `<html><body><div id="__next"></div><script src="/_next/static/chunks/main-abc.js"></script><script id="__NEXT_DATA__" type="application/json">{}</script></body></html>`;
    const techs = detectTechnologies(input(html, { 'x-powered-by': 'Next.js' }), db, categories);
    expect(techs.map((t) => t.name)).toEqual(expect.arrayContaining(['Next.js', 'React']));
  });
  it('detects Shopify and Cloudflare from headers', () => {
    const techs = detectTechnologies(input('<html></html>', { server: 'cloudflare', 'cf-ray': 'abc-LHR', 'x-shopid': '123', 'x-shopify-stage': 'production' }), db, categories);
    expect(techs.map((t) => t.name)).toEqual(expect.arrayContaining(['Shopify', 'Cloudflare']));
  });
  it('does not detect React from a /react/ path alone (negative fixture)', () => {
    const techs = detectTechnologies(input('<html><body><a href="/react/">React course</a><script src="/assets/react-course.js"></script></body></html>'), db, categories);
    expect(techs.find((t) => t.name === 'React')).toBeUndefined();
  });
  it('detects managed hosts via override headers', () => {
    const techs = detectTechnologies(input('<html></html>', { 'x-kinsta-cache': 'HIT' }), db, categories);
    expect(techs.find((t) => t.name === 'Kinsta')).toBeDefined();
  });
  it('runs the whole DB quickly', () => {
    const html = '<html><head><title>x</title></head><body>' + '<p>hello</p>'.repeat(2000) + '</body></html>';
    const t0 = Date.now();
    detectTechnologies(input(html), db, categories);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});

describe('audits', () => {
  it('grades CSP', () => {
    expect(gradeCsp("default-src 'self'; script-src 'self' 'nonce-abc'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'").issues).toEqual([]);
    expect(gradeCsp("default-src * 'unsafe-inline' 'unsafe-eval'").issues.length).toBeGreaterThanOrEqual(3);
  });
  it('recognises Cloudflare challenge pages', () => {
    expect(detectChallenge(403, { 'cf-mitigated': 'challenge' }, '')?.vendor).toBe('Cloudflare');
    expect(detectChallenge(200, {}, '<title>Just a moment...</title>')?.vendor).toBe('Cloudflare');
    expect(detectChallenge(200, {}, '<html>hi</html>')).toBeNull();
  });
});

describe('analyse()', () => {
  it('builds a full report from gathered data and stays partial-safe', () => {
    const html = `<!doctype html><html lang="en"><head><title>Acme Widgets | London</title><meta name="description" content="We make widgets."><meta name="viewport" content="width=device-width"><link rel="canonical" href="https://example.com/"><meta property="og:title" content="Acme"><meta property="og:image" content="https://example.com/og.png"><script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script><script src="https://www.googletagmanager.com/gtm.js?id=GTM-1"></script><script src="https://www.google-analytics.com/analytics.js"></script></head><body><h1>Widgets</h1><img src="a.png"><a href="/wp-login.php">Login</a></body></html>`;
    const data: GatheredData = {
      target: { input: 'example.com', url: 'https://example.com/', host: 'example.com', displayHost: 'example.com', registrableDomain: 'example.com', isSubdomain: false },
      scan: { id: 's1', createdAt: new Date().toISOString(), scannerVersion: '0.1.0', fingerprintsVersion: null },
      stages: { dns: { status: 'complete' }, http: { status: 'complete' }, files: { status: 'failed', note: 'boom' }, rdap: { status: 'complete' }, cert: { status: 'complete' }, browser: { status: 'skipped' }, external: { status: 'skipped' } },
      dns: { A: ['104.16.1.1'], AAAA: [], CNAME: [], MX: [{ priority: 10, exchange: 'aspmx.l.google.com' }], NS: ['ada.ns.cloudflare.com'], TXT: ['v=spf1 include:_spf.google.com ~all'], CAA: [], SOA: null, dnssec: false, dmarc: ['v=DMARC1; p=reject; rua=mailto:d@example.com'], mtaSts: [], dkimSelectors: ['google'], bimi: [] },
      ips: [{ ip: '104.16.1.1', version: 4, asn: 13335, asnOrg: 'CLOUDFLARENET', country: 'US', prefix: '104.16.0.0/12', reverseDns: null }],
      http: { requestedUrl: 'https://example.com/', chain: [{ url: 'https://example.com/', status: 200 }], final: { url: 'https://example.com/', status: 200, headers: { server: 'cloudflare', 'cf-ray': 'x', 'content-type': 'text/html', 'strict-transport-security': 'max-age=31536000; includeSubDomains', 'content-security-policy': "default-src 'self' 'unsafe-inline'" }, cookies: ['sess=<redacted>; Path=/; HttpOnly'], contentType: 'text/html', contentLength: null, body: html, bodyTruncated: false, protocol: null, timingMs: 100 }, httpsRedirect: null, challenge: null, error: null },
      rdap: { registrar: 'Example Registrar', created: '2001-01-01T00:00:00Z', updated: null, expires: '2030-01-01T00:00:00Z', status: ['active'], nameservers: [], dnssecSigned: false }
    };
    const r = analyse(data);
    expect(r.scan.quality).toBe('partial');
    expect(r.infra.cdn?.name).toBe('Cloudflare');
    expect(r.infra.hosting).toBeNull(); // behind CDN → not detectable
    expect(r.infra.dnsProvider?.name).toBe('Cloudflare DNS');
    expect(r.infra.emailProvider?.name).toBe('Google Workspace');
    expect(r.technologies.map((t) => t.name)).toContain('Google Tag Manager');
    expect(r.seo?.title).toBe('Acme Widgets | London');
    expect(r.seo?.structuredData.types).toContain('Organization');
    expect(r.security.find((f) => f.id === 'csp')?.status).toBe('warn');
    expect(r.security.find((f) => f.id === 'hsts')?.status).toBe('good');
    expect(r.security.find((f) => f.id === 'cookies')?.status).toBe('warn'); // no Secure / SameSite
    expect(r.security.find((f) => f.id === 'login-page')).toBeDefined();
    expect(r.email.find((f) => f.id === 'dmarc')?.status).toBe('good');
    expect(r.thirdParties.find((t) => t.domain === 'www.googletagmanager.com')?.technology).toBe('Google Tag Manager');
    expect(r.privacy.find((f) => f.id === 'consent')?.status).toBe('info');
  });
});

describe('false-positive guards', () => {
  it('treats a match inside a third-party script as low confidence', () => {
    const base = input('<html><body></body></html>');
    const techs = detectTechnologies({ ...base, scripts: { 'https://www.googletagmanager.com/gtag/js': 'var x="/wp-content/";' }, thirdPartyScripts: new Set(['https://www.googletagmanager.com/gtag/js']) }, db, categories);
    const wp = techs.find((t) => t.name === 'WordPress');
    expect(wp?.confidence ?? 'low').toBe('low');
  });
});
