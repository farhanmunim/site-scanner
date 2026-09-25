import type { CertInfo } from '../../types.js';

/**
 * Certificate details from Certificate Transparency logs (crt.sh, free). Workers cannot
 * read the negotiated certificate, so we use the most recent CT entry whose SANs cover
 * the host. A CT entry proves a cert was *issued*, not that it is the one currently
 * served — the report says so.
 */
export async function gatherCert(host: string, fetchImpl: typeof fetch = fetch): Promise<CertInfo | null> {
  let res: Response;
  try {
    res = await fetchImpl(`https://crt.sh/?q=${encodeURIComponent(host)}&output=json&exclude=expired`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(9000)
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let rows: CrtRow[];
  try {
    rows = (await res.json()) as CrtRow[];
  } catch {
    return null;
  }
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const matches = (name: string) => {
    const n = name.toLowerCase();
    if (n === host) return true;
    if (n.startsWith('*.')) {
      const suffix = n.slice(1);
      return host.endsWith(suffix) && !host.slice(0, -suffix.length).includes('.');
    }
    return false;
  };
  const candidates = rows
    .filter((r) => (r.name_value ?? '').split('\n').some(matches))
    // prefer leaf certs (precerts and leaves both appear; dedupe on serial)
    .sort((a, b) => Date.parse(b.not_before) - Date.parse(a.not_before));
  const best = candidates[0];
  if (!best) return null;
  return {
    issuer: best.issuer_name?.match(/O=([^,]+)/)?.[1] ?? best.issuer_name ?? null,
    subject: best.common_name ?? null,
    notBefore: best.not_before ? new Date(best.not_before + 'Z').toISOString() : null,
    notAfter: best.not_after ? new Date(best.not_after + 'Z').toISOString() : null,
    sans: [...new Set((best.name_value ?? '').split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 50),
    source: 'ct-log'
  };
}

interface CrtRow {
  issuer_name?: string;
  common_name?: string;
  name_value?: string;
  not_before: string;
  not_after: string;
  serial_number?: string;
}
