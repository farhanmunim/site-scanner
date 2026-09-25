import type { BrowserCookie, Evidence, Finding, HttpStageData, TechnologyDetection } from '../../types.js';
import type { TlsInfo } from '../../gather/stages/tls.js';
import type { ParsedHtml } from '../html.js';

/**
 * Observable security configuration. Findings describe what was observed and what the
 * absence may mean — never "you are vulnerable to X".
 */

const ev = (key: string, value: string): Evidence[] => [{ source: 'header', key, value: value.length > 300 ? value.slice(0, 297) + '…' : value }];

export function gradeCsp(csp: string): { status: Finding['status']; issues: string[]; directives: number } {
  const directives = new Map<string, string[]>();
  for (const part of csp.split(';')) {
    const [name, ...vals] = part.trim().split(/\s+/);
    if (name) directives.set(name.toLowerCase(), vals.map((v) => v.toLowerCase()));
  }
  const issues: string[] = [];
  const scriptSrc = directives.get('script-src') ?? directives.get('default-src');
  if (!scriptSrc) issues.push('no script-src or default-src');
  else {
    const hasNonceOrHash = scriptSrc.some((v) => v.startsWith("'nonce-") || v.startsWith("'sha"));
    const strictDynamic = scriptSrc.includes("'strict-dynamic'");
    if (scriptSrc.includes("'unsafe-inline'") && !hasNonceOrHash && !strictDynamic) issues.push("'unsafe-inline' in script-src (weakens XSS protection)");
    if (scriptSrc.includes("'unsafe-eval'")) issues.push("'unsafe-eval' in script-src");
    if (scriptSrc.some((v) => v === '*' || v === 'http:' || v === 'https:')) issues.push('wildcard scheme/host in script-src');
    if (scriptSrc.includes('data:')) issues.push('data: allowed in script-src');
  }
  if (!directives.has('object-src') && !directives.has('default-src')) issues.push('object-src not restricted');
  if (!directives.has('base-uri')) issues.push('base-uri not set');
  if (!directives.has('frame-ancestors')) issues.push('frame-ancestors not set (clickjacking protection relies on X-Frame-Options)');
  const reportOnly = false;
  const status: Finding['status'] = issues.length === 0 ? 'good' : issues.length <= 2 ? 'warn' : 'warn';
  return { status: reportOnly ? 'info' : status, issues, directives: directives.size };
}

export function auditSecurityHeaders(http: HttpStageData, tls: TlsInfo | null, html: ParsedHtml | null, cookies: BrowserCookie[] | null, techs: TechnologyDetection[]): Finding[] {
  const out: Finding[] = [];
  const f = http.final;
  if (!f) return out;
  const h = f.headers;
  const isHttps = f.url.startsWith('https://');

  // Transport
  out.push(
    isHttps
      ? { id: 'https', title: 'HTTPS', status: 'good', observed: 'The final page is served over HTTPS.', owasp: 'A02' }
      : { id: 'https', title: 'HTTPS', status: 'bad', observed: 'The final page is served over plain HTTP.', detail: 'Traffic can be read or altered in transit. Serve the site over HTTPS.', owasp: 'A02' }
  );
  if (http.httpsRedirect !== null) {
    out.push(
      http.httpsRedirect
        ? { id: 'https-redirect', title: 'HTTP → HTTPS redirect', status: 'good', observed: 'http:// redirected to https://.', owasp: 'A02' }
        : { id: 'https-redirect', title: 'HTTP → HTTPS redirect', status: 'warn', observed: 'http:// did not redirect to https://.', owasp: 'A02' }
    );
  }
  if (tls) {
    if (tls.source === 'handshake') {
      out.push(
        tls.authorized
          ? { id: 'tls-cert', title: 'TLS certificate', status: 'good', observed: `Valid certificate from ${tls.issuer ?? 'unknown issuer'}, expires ${tls.notAfter?.slice(0, 10) ?? '?'}.`, owasp: 'A02' }
          : { id: 'tls-cert', title: 'TLS certificate', status: 'bad', observed: `Certificate did not validate: ${tls.authorizationError}.`, owasp: 'A02' }
      );
      const days = tls.notAfter ? Math.round((Date.parse(tls.notAfter) - Date.now()) / 86_400_000) : null;
      if (days !== null && days < 14) out.push({ id: 'tls-expiry', title: 'Certificate expiry', status: days < 0 ? 'bad' : 'warn', observed: days < 0 ? 'The certificate has expired.' : `The certificate expires in ${days} day(s).` });
      if (tls.protocol && /TLSv1(\.0|\.1)?$/.test(tls.protocol)) out.push({ id: 'tls-version', title: 'TLS version', status: 'warn', observed: `Negotiated ${tls.protocol}.`, detail: 'TLS 1.0/1.1 are deprecated; modern clients negotiate 1.2 or 1.3.' });
      else if (tls.protocol) out.push({ id: 'tls-version', title: 'TLS version', status: 'good', observed: `Negotiated ${tls.protocol}${tls.alpn ? ` (ALPN ${tls.alpn})` : ''}.` });
    }
  }

  // Headers
  const hsts = h['strict-transport-security'];
  if (isHttps) {
    if (!hsts) out.push({ id: 'hsts', title: 'Strict-Transport-Security', status: 'warn', observed: 'Header not observed.', detail: 'HSTS tells browsers to always use HTTPS for this host. Absence is common and not itself a vulnerability.', owasp: 'A05' });
    else {
      const maxAge = Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? 0);
      out.push({ id: 'hsts', title: 'Strict-Transport-Security', status: maxAge >= 15552000 ? 'good' : 'warn', observed: `max-age=${maxAge}${/includeSubDomains/i.test(hsts) ? ', includeSubDomains' : ''}${/preload/i.test(hsts) ? ', preload' : ''}.`, detail: maxAge < 15552000 ? 'max-age below 6 months; browsers and the preload list expect at least 31536000.' : undefined, evidence: ev('strict-transport-security', hsts), owasp: 'A05' });
    }
  }

  const csp = h['content-security-policy'];
  const cspRo = h['content-security-policy-report-only'];
  if (csp) {
    const g = gradeCsp(csp);
    out.push({ id: 'csp', title: 'Content-Security-Policy', status: g.status, observed: g.issues.length ? `Present (${g.directives} directives) with weaknesses: ${g.issues.join('; ')}.` : `Present with ${g.directives} directives and no obvious weaknesses.`, detail: 'CSP limits where scripts and other resources may load from, which reduces the impact of cross-site scripting (XSS).', evidence: ev('content-security-policy', csp), owasp: 'A03' });
  } else if (cspRo) {
    out.push({ id: 'csp', title: 'Content-Security-Policy', status: 'info', observed: 'Only a report-only policy was observed (not enforced).', evidence: ev('content-security-policy-report-only', cspRo), owasp: 'A03' });
  } else {
    out.push({ id: 'csp', title: 'Content-Security-Policy', status: 'warn', observed: 'Header not observed.', detail: 'Without a CSP, an injected script runs with full page privileges. Many sites operate without one; adding a policy is a defence-in-depth improvement.', owasp: 'A03' });
  }

  const xcto = h['x-content-type-options'];
  out.push(xcto && /nosniff/i.test(xcto) ? { id: 'xcto', title: 'X-Content-Type-Options', status: 'good', observed: 'nosniff.', owasp: 'A05' } : { id: 'xcto', title: 'X-Content-Type-Options', status: 'warn', observed: 'Header not observed.', detail: 'nosniff stops browsers guessing content types, which prevents some script-injection tricks.', owasp: 'A05' });

  const xfo = h['x-frame-options'];
  const frameAncestors = csp && /frame-ancestors/i.test(csp);
  out.push(
    frameAncestors
      ? { id: 'framing', title: 'Framing protection', status: 'good', observed: 'CSP frame-ancestors directive present.', owasp: 'A05' }
      : xfo
        ? { id: 'framing', title: 'Framing protection', status: 'good', observed: `X-Frame-Options: ${xfo}.`, evidence: ev('x-frame-options', xfo), owasp: 'A05' }
        : { id: 'framing', title: 'Framing protection', status: 'warn', observed: 'Neither X-Frame-Options nor CSP frame-ancestors observed.', detail: 'Without it, the page can be embedded in a frame on another site (clickjacking).', owasp: 'A05' }
  );

  const rp = h['referrer-policy'];
  out.push(rp ? { id: 'referrer', title: 'Referrer-Policy', status: /no-referrer|strict-origin|same-origin/i.test(rp) ? 'good' : 'info', observed: rp, evidence: ev('referrer-policy', rp) } : { id: 'referrer', title: 'Referrer-Policy', status: 'info', observed: 'Header not observed; browser default (strict-origin-when-cross-origin) applies.' });

  const pp = h['permissions-policy'];
  out.push(pp ? { id: 'permissions', title: 'Permissions-Policy', status: 'good', observed: 'Present.', evidence: ev('permissions-policy', pp) } : { id: 'permissions', title: 'Permissions-Policy', status: 'info', observed: 'Header not observed.', detail: 'Restricts browser features (camera, geolocation…) for the page and embedded frames.' });

  const coop = h['cross-origin-opener-policy'];
  if (coop) out.push({ id: 'coop', title: 'Cross-Origin-Opener-Policy', status: 'good', observed: coop });

  // Information disclosure (informational, not a vulnerability)
  const server = h['server'];
  const xpb = h['x-powered-by'];
  const versioned = [server, xpb].filter((v): v is string => !!v && /\d+\.\d+/.test(v));
  if (versioned.length) out.push({ id: 'version-disclosure', title: 'Server version disclosure', status: 'info', observed: `Headers reveal software versions: ${versioned.join(' | ')}.`, detail: 'Version strings make it easier to look up known issues for that exact release. Hiding them is low-effort hygiene.', owasp: 'A05' });

  // Cookies (from Set-Cookie on the document; browser stage adds runtime cookies)
  const setCookies = f.cookies;
  if (setCookies.length) {
    const issues: string[] = [];
    for (const c of setCookies) {
      const name = c.split('=')[0]!;
      const attrs = c.toLowerCase();
      const problems: string[] = [];
      if (isHttps && !/;\s*secure/.test(attrs)) problems.push('no Secure');
      if (!/;\s*httponly/.test(attrs) && !/^(_ga|_gid|_fbp|_hj)/.test(name)) problems.push('no HttpOnly');
      if (!/;\s*samesite=/.test(attrs)) problems.push('no SameSite');
      if (problems.length) issues.push(`${name} (${problems.join(', ')})`);
    }
    out.push(issues.length ? { id: 'cookies', title: 'Cookie attributes', status: 'warn', observed: `${setCookies.length} cookie(s) set on the page response; ${issues.length} lack recommended attributes: ${issues.slice(0, 6).join('; ')}${issues.length > 6 ? '…' : ''}.`, detail: 'Secure keeps cookies off plain HTTP, HttpOnly keeps them away from scripts, SameSite limits cross-site sending (CSRF). Analytics cookies legitimately lack HttpOnly.', owasp: 'A01' } : { id: 'cookies', title: 'Cookie attributes', status: 'good', observed: `${setCookies.length} cookie(s) set, all with Secure/HttpOnly/SameSite as applicable.`, owasp: 'A01' });
  } else if (cookies && cookies.length) {
    const bad = cookies.filter((c) => !c.thirdParty && (!c.secure || c.sameSite === null));
    out.push(bad.length ? { id: 'cookies', title: 'Cookie attributes', status: 'warn', observed: `${cookies.length} cookie(s) after rendering; ${bad.length} first-party cookie(s) lack Secure or SameSite: ${bad.slice(0, 6).map((c) => c.name).join(', ')}.`, owasp: 'A01' } : { id: 'cookies', title: 'Cookie attributes', status: 'good', observed: `${cookies.length} cookie(s) after rendering, first-party cookies use Secure and SameSite.`, owasp: 'A01' });
  }

  // Subresource integrity (supply chain)
  if (html && html.sri.externalScripts > 0) {
    const pct = Math.round((html.sri.withIntegrity / html.sri.externalScripts) * 100);
    out.push({ id: 'sri', title: 'Subresource Integrity on third-party scripts', status: pct === 100 ? 'good' : pct > 0 ? 'info' : 'info', observed: `${html.sri.withIntegrity} of ${html.sri.externalScripts} external script(s) carry an integrity hash.`, detail: 'SRI makes the browser refuse a third-party script that has been tampered with. It only suits scripts with fixed versions; tag managers and analytics loaders usually cannot use it.', owasp: 'A08' });
  }
  if (html && html.mixedContent > 0) out.push({ id: 'mixed-content', title: 'Mixed content', status: 'warn', observed: `${html.mixedContent} resource(s) referenced over http:// on an https:// page.`, owasp: 'A02' });

  // Login exposure (only from links already in the page; no probing)
  const login = html?.links.find((l) => /\/wp-login\.php|\/wp-admin\/?$|\/administrator\/?$|\/user\/login$|\/login\/?$/i.test(new URL(l.href).pathname));
  if (login) {
    const hasCaptcha = techs.some((t) => /reCAPTCHA|hCaptcha|Turnstile|Friendly Captcha/i.test(t.name));
    out.push({ id: 'login-page', title: 'Login page linked', status: 'info', observed: `A login page is linked from the homepage (${new URL(login.href).pathname}). ${hasCaptcha ? 'A CAPTCHA/bot-check service is present on the site.' : 'No CAPTCHA/bot-check service was detected on the homepage.'}`, detail: 'Public login pages attract automated password guessing (credential stuffing). Rate limiting, MFA and a bot check reduce it.', owasp: 'A07' });
  }
  if (html?.forms.some((fm) => fm.hasPassword && fm.action && fm.action.startsWith('http://'))) out.push({ id: 'password-form-http', title: 'Password form posts over HTTP', status: 'bad', observed: 'A form with a password field submits to an http:// URL.', owasp: 'A02' });

  return out;
}
