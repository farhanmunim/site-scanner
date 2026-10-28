import type { Finding, PhpInfo, TechnologyDetection } from '../types.js';
import type { ParsedHtml } from './html.js';

/** End of security support per PHP branch (php.net/supported-versions.php). */
export const PHP_EOL: Record<string, string> = {
  '5.6': '2018-12-31',
  '7.0': '2018-12-03',
  '7.1': '2019-12-01',
  '7.2': '2020-11-30',
  '7.3': '2021-12-06',
  '7.4': '2022-11-28',
  '8.0': '2023-11-26',
  '8.1': '2025-12-31',
  '8.2': '2026-12-31',
  '8.3': '2027-12-31',
  '8.4': '2028-12-31',
  '8.5': '2029-12-31'
};

export function phpBranch(version: string): string | null {
  const m = /^(\d+)\.(\d+)/.exec(version);
  return m ? `${m[1]}.${m[2]}` : null;
}

/** Which PHP does the site run, and does it still get security fixes? Passive: headers, cookies, URLs, fingerprints. */
export function detectPhp(headers: Record<string, string>, cookies: string[], html: ParsedHtml | null, techs: TechnologyDetection[], now = new Date()): PhpInfo {
  let version: string | null = null;
  let source: PhpInfo['source'] = null;
  const hdr = `${headers['x-powered-by'] ?? ''} ${headers['server'] ?? ''}`;
  const fromHeader = /\bPHP\/(\d+\.\d+(?:\.\d+)?[\w.\-~+]*)/i.exec(hdr)?.[1];
  if (fromHeader) {
    version = fromHeader;
    source = 'header';
  }
  const tech = techs.find((t) => t.name === 'PHP' && !t.implied);
  if (!version && tech?.version) {
    version = tech.version;
    source = 'fingerprint';
  }
  if (!source && tech) source = 'fingerprint';
  if (!source && /\bPHP\//i.test(hdr)) source = 'header';
  if (!source && cookies.some((c) => /^PHPSESSID=/i.test(c))) source = 'cookie';
  if (!source && html?.links.some((l) => !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(l.href) && /\.php(?:$|[?#])/i.test(l.href))) source = 'url';
  const detected = source !== null;
  const branch = version ? phpBranch(version) : null;
  const [maj, min] = (branch ?? '').split('.').map(Number);
  // Anything older than 5.6 is long past support even though it is not in the table.
  const eol = branch ? PHP_EOL[branch] ?? (maj !== undefined && min !== undefined && (maj < 5 || (maj === 5 && min < 6)) ? '2018-12-31' : null) : null;
  // Distro packages (Debian/Ubuntu/RHEL/Remi/Sury) backport security fixes, so the branch date overstates the risk.
  const distroBuild = !!version && /(ubuntu|deb\d|el\d|\.rhel|sury|remi|~|\+)/i.test(version);
  const supported = eol ? Date.parse(eol) > now.getTime() : branch && Number(branch.split('.')[0]) >= 9 ? true : null;

  const findings: Finding[] = [];
  if (detected) {
    if (version && supported === false && distroBuild) {
      findings.push({ id: 'php-eol', title: 'PHP branch past upstream support', status: 'warn', observed: `PHP ${version} (branch ${branch}) is past upstream end-of-life (${eol}), but this looks like a distribution build.`, detail: 'Distributions often backport security fixes to old branches, so this may still be patched. Confirm with your host, and plan an upgrade to a supported branch.', owasp: 'A06', evidence: [{ source: source === 'header' ? 'header' : 'text', key: 'php', value: `PHP ${version}` }] });
    } else if (version && supported === false) {
      findings.push({ id: 'php-eol', title: 'PHP version no longer supported', status: 'bad', observed: `PHP ${version} (branch ${branch}) reached end of security support on ${eol}.`, detail: 'Unsupported PHP versions receive no security fixes. Upgrade to a supported branch (php.net/supported-versions.php).', owasp: 'A06', evidence: [{ source: source === 'header' ? 'header' : 'text', key: 'php', value: `PHP ${version}` }] });
    } else if (version && supported === true) {
      findings.push({ id: 'php-version', title: 'PHP version', status: 'good', observed: `PHP ${version}, supported until ${eol ?? 'further notice'}.` });
    } else if (version) {
      findings.push({ id: 'php-version', title: 'PHP version', status: 'info', observed: `PHP ${version} (branch ${branch ?? 'unknown'}); support status is not in our table.` });
    } else {
      findings.push({ id: 'php-version', title: 'PHP version', status: 'unknown', observed: 'PHP is in use but the version is not publicly visible.', detail: 'Hiding the version is fine; make sure the server is on a supported branch. The hosting panel or `php -v` shows the exact version.' });
    }
    if (/\bPHP\//i.test(headers['x-powered-by'] ?? '')) {
      findings.push({ id: 'php-exposed', title: 'PHP version disclosed', status: 'info', observed: `X-Powered-By: ${headers['x-powered-by']}`, detail: 'Set expose_php = Off in php.ini so the exact version is not advertised to every visitor.', owasp: 'A05' });
    }
  }
  return { detected, version, source, branch, eol, supported: supported ?? null, findings };
}
