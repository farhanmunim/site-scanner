import type { Finding, RdapData } from '../types.js';

const DAY = 86_400_000;

/** Registration facts from RDAP: expiry, age, transfer lock, DNSSEC at the registry. */
export function auditDomain(rdap: RdapData | null, now = new Date()): Finding[] {
  if (!rdap) return [];
  const out: Finding[] = [];
  if (rdap.expires && Number.isFinite(Date.parse(rdap.expires))) {
    const days = Math.floor((Date.parse(rdap.expires) - now.getTime()) / DAY);
    out.push(
      days < 0
        ? { id: 'domain-expiry', title: 'Domain registration', status: 'bad', observed: `Expired ${-days} days ago (${rdap.expires.slice(0, 10)}).`, detail: 'An expired domain can be released and re-registered by someone else.' }
        : days <= 30
          ? { id: 'domain-expiry', title: 'Domain registration', status: 'warn', observed: `Expires in ${days} days (${rdap.expires.slice(0, 10)}).`, detail: 'Renew soon and enable auto-renew so the domain cannot lapse.' }
          : { id: 'domain-expiry', title: 'Domain registration', status: 'good', observed: `Expires ${rdap.expires.slice(0, 10)} (${days} days).` }
    );
  }
  if (rdap.created && Number.isFinite(Date.parse(rdap.created))) {
    const years = (now.getTime() - Date.parse(rdap.created)) / (365.25 * DAY);
    out.push({ id: 'domain-age', title: 'Domain age', status: years < 0.25 ? 'warn' : 'info', observed: years < 1 ? `Registered ${Math.max(0, Math.round(years * 12))} month(s) ago (${rdap.created.slice(0, 10)}).` : `Registered ${years.toFixed(1)} years ago (${rdap.created.slice(0, 10)}).`, detail: years < 0.25 ? 'Very new domains are more often associated with abuse; mail providers treat them cautiously.' : undefined });
  }
  if (rdap.status.length) {
    const locked = rdap.status.some((s) => /client\s*transfer\s*prohibited/i.test(s));
    out.push(locked ? { id: 'domain-lock', title: 'Transfer lock', status: 'good', observed: 'Registrar transfer lock is on.', detail: 'Stops the domain being transferred away without unlocking it first.' } : { id: 'domain-lock', title: 'Transfer lock', status: 'info', observed: `Status: ${rdap.status.join(', ')}. No transfer lock seen.`, detail: 'Some registries (and privacy-redacted records) do not expose lock status.' });
  }
  return out;
}
