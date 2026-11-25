import type { ExposedSecret } from '../types.js';

interface Rule {
  kind: string;
  re: RegExp;
  severity: ExposedSecret['severity'];
}

/**
 * Patterns for credentials that should never ship to a browser. High-signal prefixes only: random
 * "looks like a key" entropy matching produces too many false alarms. Publishable keys (Stripe pk_,
 * Google Maps/Firebase web keys) are deliberately excluded: they are meant to be public.
 */
const RULES: Rule[] = [
  { kind: 'AWS access key ID', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, severity: 'high' },
  { kind: 'Stripe secret key', re: /\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}\b/g, severity: 'high' },
  { kind: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, severity: 'high' },
  { kind: 'Slack token', re: /\bxox[abprs]-[0-9A-Za-z-]{20,}\b/g, severity: 'high' },
  { kind: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g, severity: 'high' },
  { kind: 'SendGrid API key', re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, severity: 'high' },
  { kind: 'Twilio API key', re: /\bSK[0-9a-f]{32}\b/g, severity: 'medium' },
  { kind: 'Mailgun API key', re: /\bkey-[0-9a-f]{32}\b/g, severity: 'medium' },
  { kind: 'Google OAuth client secret', re: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/g, severity: 'high' },
  { kind: 'npm token', re: /\bnpm_[A-Za-z0-9]{36}\b/g, severity: 'high' },
  { kind: 'Telegram bot token', re: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/g, severity: 'medium' },
  { kind: 'Database connection string with password', re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/'"]+:[^\s@/'"]{3,}@[^\s'"]+/gi, severity: 'high' },
  { kind: 'Hard-coded password assignment', re: /\b(?:password|passwd|secret|api_?key|client_secret)["']?\s*[:=]\s*["'][^"'\s]{8,}["']/gi, severity: 'low' }
];

// Provider-format keys are only dismissed when they look like documentation samples; the loose generic
// assignments additionally lose obvious fillers. (A key that merely contains "test" is still a key.)
const PLACEHOLDER_STRICT = /(example|xxxx|placeholder|changeme|dummy|<|\$\{|process\.env)/i;
const PLACEHOLDER = /(example|your[_-]?|xxxx|placeholder|changeme|dummy|sample|test|<|\$\{|process\.env|undefined|null)/i;

function redact(v: string): string {
  return v.length <= 8 ? `${v[0]}…` : `${v.slice(0, 4)}…${v.slice(-2)} (${v.length} chars)`;
}

/** Scan already-fetched page and script text for leaked credentials. Never stores the full value. */
export function findExposedSecrets(sources: { source: string; text: string }[]): ExposedSecret[] {
  const out: ExposedSecret[] = [];
  const seen = new Set<string>();
  for (const { source, text } of sources) {
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      for (const m of text.slice(0, 1_000_000).matchAll(rule.re)) {
        const value = m[0];
        const generic = rule.severity === 'low';
        if ((generic ? PLACEHOLDER : PLACEHOLDER_STRICT).test(value)) continue;
        // Translation strings ({"password":"Wachtwoord"}) are all letters; real secrets mix in digits or symbols.
        if (generic && !/[0-9_\-!@#$%^&*]/.test(/["']([^"']+)["']\s*$/.exec(value)?.[1] ?? '')) continue;
        const key = `${rule.kind}|${value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ kind: rule.kind, preview: redact(value), source, severity: rule.severity });
        // Collect generously, then keep the worst 25: a pile of low-severity hits must not hide an AWS key.
        if (out.length >= 500) break;
      }
    }
  }
  const order = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 25);
}
