#!/usr/bin/env node
// Generates ADMIN_PASSWORD_HASH (PBKDF2-SHA256, WebCrypto-compatible) and, optionally,
// a TOTP secret. Usage: node scripts/hash-password.mjs '<password>' [--totp]
import { webcrypto as crypto } from 'node:crypto';

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error('Usage: node scripts/hash-password.mjs "<password of 12+ chars>" [--totp]');
  process.exit(1);
}
const iterations = 100_000; // Cloudflare Workers caps PBKDF2 at 100k iterations
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
const b64 = (u) => Buffer.from(u).toString('base64url');
console.log(`ADMIN_PASSWORD_HASH=pbkdf2$${iterations}$${b64(salt)}$${b64(new Uint8Array(bits))}`);

if (process.argv.includes('--totp')) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const raw = crypto.getRandomValues(new Uint8Array(20));
  let bitsStr = '';
  for (const b of raw) bitsStr += b.toString(2).padStart(8, '0');
  let secret = '';
  for (let i = 0; i + 5 <= bitsStr.length; i += 5) secret += alphabet[parseInt(bitsStr.slice(i, i + 5), 2)];
  console.log(`ADMIN_TOTP_SECRET=${secret}`);
  console.log(`otpauth://totp/SiteScanner:admin?secret=${secret}&issuer=SiteScanner`);
}
