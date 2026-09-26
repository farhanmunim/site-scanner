import { describe, expect, it } from 'vitest';
import { describeCert } from '../src/gather/stages/tls.js';

describe('describeCert', () => {
  it('describes an RSA leaf', () => {
    const c = describeCert({ subject: { CN: 'www.example.com' }, issuer: { O: "Let's Encrypt", CN: 'R11' }, valid_from: 'Jan  1 00:00:00 2026 GMT', valid_to: 'Apr  1 00:00:00 2026 GMT', bits: 2048, fingerprint256: 'AA', issuerCertificate: { fingerprint256: 'BB' } });
    expect(c).toEqual({ subject: 'www.example.com', issuer: "Let's Encrypt", notBefore: '2026-01-01T00:00:00.000Z', notAfter: '2026-04-01T00:00:00.000Z', keyType: 'RSA', keyBits: 2048, curve: null, selfSigned: false });
  });
  it('describes an EC intermediate', () => {
    const c = describeCert({ subject: { CN: 'E5' }, issuer: { CN: 'ISRG Root X2' }, bits: 256, asn1Curve: 'prime256v1', nistCurve: 'P-256', fingerprint256: 'CC', issuerCertificate: { fingerprint256: 'DD' } });
    expect(c.keyType).toBe('EC');
    expect(c.curve).toBe('P-256');
    expect(c.issuer).toBe('ISRG Root X2');
    expect(c.selfSigned).toBe(false);
  });
  it('flags a self-signed root', () => {
    const root = { subject: { CN: 'ISRG Root X1' }, issuer: { O: 'Internet Security Research Group' }, bits: 4096, fingerprint256: 'EE' } as Parameters<typeof describeCert>[0];
    root.issuerCertificate = root;
    expect(describeCert(root).selfSigned).toBe(true);
  });
});
