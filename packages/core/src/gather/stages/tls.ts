import tls from 'node:tls';
import type { CertInfo } from '../../types.js';
import { checkIp } from '../ip.js';
import { resolveAddresses } from '../doh.js';
import { gatherCert } from './cert.js';

const str = (v: string | string[] | undefined | null): string | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export interface TlsInfo extends CertInfo {
  protocol: string | null; // TLSv1.3
  cipher: string | null;
  alpn: string | null; // h2 / http/1.1
  authorized: boolean;
  authorizationError: string | null;
  chain: { subject: string | null; issuer: string | null }[];
  source: 'ct-log' | 'handshake';
}

/**
 * Direct TLS handshake on port 443 (one connection, no data sent, closed immediately).
 * Falls back to Certificate Transparency when the handshake fails.
 */
export async function gatherTls(host: string, port = 443, blockedIps?: ReadonlySet<string>): Promise<TlsInfo | null> {
  let ips: { v4: string[]; v6: string[] };
  try {
    ips = await resolveAddresses(host);
  } catch {
    return null;
  }
  const ip = ips.v4[0] ?? ips.v6[0];
  if (!ip) return null;
  const c = checkIp(ip, blockedIps);
  if (!c.ok) return null;

  const handshake = await new Promise<TlsInfo | null>((resolve) => {
    const socket = tls.connect({
      host: ip,
      servername: host,
      port,
      ALPNProtocols: ['h2', 'http/1.1'],
      rejectUnauthorized: false, // we report validity ourselves
      timeout: 8000
    });
    const done = (v: TlsInfo | null) => {
      socket.destroy();
      resolve(v);
    };
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate(true);
      const chain: TlsInfo['chain'] = [];
      let cur: tls.DetailedPeerCertificate | undefined = cert;
      const seen = new Set<string>();
      while (cur && cur.fingerprint256 && !seen.has(cur.fingerprint256) && chain.length < 6) {
        seen.add(cur.fingerprint256);
        chain.push({ subject: str(cur.subject?.CN), issuer: str(cur.issuer?.O) ?? str(cur.issuer?.CN) });
        cur = cur.issuerCertificate;
      }
      const sans = (cert.subjectaltname ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.startsWith('DNS:'))
        .map((s) => s.slice(4).toLowerCase());
      done({
        issuer: str(cert.issuer?.O) ?? str(cert.issuer?.CN),
        subject: str(cert.subject?.CN),
        notBefore: cert.valid_from ? new Date(cert.valid_from).toISOString() : null,
        notAfter: cert.valid_to ? new Date(cert.valid_to).toISOString() : null,
        sans: sans.slice(0, 50),
        protocol: socket.getProtocol(),
        cipher: socket.getCipher()?.name ?? null,
        alpn: typeof socket.alpnProtocol === 'string' ? socket.alpnProtocol : null,
        authorized: socket.authorized,
        authorizationError: socket.authorized ? null : String(socket.authorizationError ?? 'unknown'),
        chain,
        source: 'handshake'
      });
    });
    socket.once('timeout', () => done(null));
    socket.once('error', () => done(null));
  });
  if (handshake) return handshake;

  const ct = await gatherCert(host);
  return ct ? { ...ct, protocol: null, cipher: null, alpn: null, authorized: false, authorizationError: 'not verified (CT log data)', chain: [], source: 'ct-log' } : null;
}
