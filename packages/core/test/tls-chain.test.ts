import { describe, expect, it } from 'vitest';
import { auditSecurityHeaders } from '../src/analyze/audits/security.js';
import { explainFailure } from '../src/analyze/reasons.js';
import type { TlsInfo } from '../src/gather/stages/tls.js';
import type { HttpStageData } from '../src/types.js';

const http = { chain: [], final: { url: 'https://example.com/', status: 200, headers: {}, cookies: [], contentType: 'text/html', contentLength: 0, body: '', truncated: false, protocol: 'h2' }, httpsRedirect: true, challenge: null } as unknown as HttpStageData;
const tls = (over: Partial<TlsInfo>): TlsInfo => ({ issuer: 'DigiCert Inc', subject: 'example.com', notBefore: null, notAfter: '2027-02-10T00:00:00Z', sans: [], source: 'handshake', protocol: 'TLSv1.3', cipher: null, alpn: 'h2', authorized: false, authorizationError: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', chain: [{ subject: 'example.com', issuer: 'DigiCert Inc', notBefore: null, notAfter: null, keyType: 'RSA', keyBits: 2048, curve: null, selfSigned: false }], ...over });

describe('incomplete certificate chain', () => {
  it('is a warning with an explanation, not a failed certificate', () => {
    const out = auditSecurityHeaders(http, tls({}), null, null, []);
    expect(out.find((f) => f.id === 'tls-cert')?.status).toBe('warn');
    const chain = out.find((f) => f.id === 'tls-chain');
    expect(chain?.status).toBe('warn');
    expect(chain?.observed).toMatch(/not the intermediate that links it to DigiCert Inc/);
  });
  it('still fails an expired or self-signed certificate', () => {
    const out = auditSecurityHeaders(http, tls({ authorizationError: 'CERT_HAS_EXPIRED' }), null, null, []);
    expect(out.find((f) => f.id === 'tls-cert')?.status).toBe('bad');
    expect(out.find((f) => f.id === 'tls-chain')).toBeUndefined();
  });
});

describe('explainFailure', () => {
  it('turns error codes into sentences', () => {
    expect(explainFailure('Network error: UNABLE_TO_VERIFY_LEAF_SIGNATURE')).toBe("the server's certificate chain is incomplete");
    expect(explainFailure('Network error: ENOTFOUND')).toBe('the domain does not resolve');
    expect(explainFailure('Network error: UND_ERR_CONNECT_TIMEOUT')).toBe('the server did not respond in time');
    expect(explainFailure('Network error: EWEIRD')).toBe('the connection failed (EWEIRD)');
  });
});
