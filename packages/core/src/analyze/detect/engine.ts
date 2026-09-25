import type { Confidence, Evidence, EvidenceSource, TechnologyDetection } from '../../types.js';

/**
 * Wappalyzer-format fingerprint engine. Runs every technology's patterns against the
 * gathered inputs and records *which pattern matched on which source* as evidence.
 */

export interface Fingerprint {
  cats: number[];
  website?: string;
  description?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  html?: string | string[];
  text?: string | string[];
  scriptSrc?: string | string[];
  scripts?: string | string[];
  js?: Record<string, string>;
  xhr?: string | string[];
  meta?: Record<string, string | string[]>;
  url?: string | string[];
  dns?: Record<string, string | string[]>;
  dom?: string | string[] | Record<string, DomRule>;
  certIssuer?: string;
  implies?: string | string[];
  excludes?: string | string[];
  requires?: string | string[];
  requiresCategory?: number | number[];
  cpe?: string;
  oss?: boolean;
  saas?: boolean;
}

interface DomRule {
  exists?: string;
  text?: string;
  attributes?: Record<string, string>;
  properties?: Record<string, string>;
}

export type FingerprintDb = Record<string, Fingerprint>;
export type CategoryDb = Record<string, { name: string; priority: number; groups?: number[] }>;

export interface DetectInput {
  url: string;
  headers: Record<string, string>;
  /** Redacted Set-Cookie strings: "name=<redacted>; Path=/; ..." */
  cookies: string[];
  html: string;
  /** Visible text (optional; derived from html if absent). */
  text?: string;
  scriptSrc: string[];
  /** Script file contents we fetched (url -> body). */
  scripts: Record<string, string>;
  /** Keys of `scripts` that are third-party files (a match inside them is weak evidence). */
  thirdPartyScripts?: Set<string>;
  meta: Record<string, string[]>;
  dns: Record<string, string[]>;
  certIssuer?: string | null;
  /** Rendered-page JS values from the browser stage: path -> string value. */
  js?: Record<string, string>;
  xhr?: string[];
  /** DOM query function from the browser/linkedom document, if available. */
  dom?: DomQuery;
}

export interface DomQuery {
  querySelectorAll(selector: string): ArrayLike<DomElement>;
}
export interface DomElement {
  getAttribute(name: string): string | null;
  textContent: string | null;
}

interface CompiledPattern {
  regex: RegExp | null;
  raw: string;
  confidence: number;
  version: string | null;
}

const patternCache = new Map<string, CompiledPattern>();

/** Parse "regex\;confidence:50\;version:\1" into a compiled pattern. */
export function compilePattern(p: string): CompiledPattern {
  const cached = patternCache.get(p);
  if (cached) return cached;
  const parts = p.split('\\;');
  const raw = parts[0] ?? '';
  let confidence = 100;
  let version: string | null = null;
  for (const attr of parts.slice(1)) {
    const [k, ...rest] = attr.split(':');
    const v = rest.join(':');
    if (k === 'confidence') confidence = Number(v) || 100;
    else if (k === 'version') version = v;
  }
  let regex: RegExp | null = null;
  if (raw !== '') {
    try {
      regex = new RegExp(raw.replace(/\//g, '\\/'), 'i');
    } catch {
      regex = null;
    }
  }
  const out = { regex, raw, confidence, version };
  patternCache.set(p, out);
  return out;
}

/** Resolve a Wappalyzer version template ("\1", "\1?\1:2.x") against a regex match. */
export function resolveVersion(template: string | null, m: RegExpMatchArray | null): string | null {
  if (!template || !m) return null;
  let out = template;
  // ternary: \1?a:b
  const tern = /\\(\d)\?([^:]*):(.*)/.exec(template);
  if (tern) {
    const g = m[Number(tern[1])];
    out = g ? tern[2]!.replace(/\\(\d)/g, (_, n) => m[Number(n)] ?? '') : tern[3]!.replace(/\\(\d)/g, (_, n) => m[Number(n)] ?? '');
  } else {
    out = template.replace(/\\(\d)/g, (_, n) => m[Number(n)] ?? '');
  }
  out = out.trim();
  return out === '' ? null : out.slice(0, 40);
}

function arr<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

interface Hit {
  confidence: number;
  version: string | null;
  evidence: Evidence;
}

function testValue(pattern: string, value: string, source: EvidenceSource, key?: string): Hit | null {
  const cp = compilePattern(pattern);
  if (cp.raw === '') {
    // empty pattern = presence check
    return { confidence: cp.confidence, version: null, evidence: { source, key, value: snippet(value), pattern: '(present)' } };
  }
  if (!cp.regex) return null;
  const m = cp.regex.exec(value);
  if (!m) return null;
  return { confidence: cp.confidence, version: resolveVersion(cp.version, m), evidence: { source, key, value: snippet(m[0] || value), pattern: cp.raw } };
}

function snippet(s: string, max = 160): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function toConfidence(score: number): Confidence {
  if (score >= 100) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

export interface DetectOptions {
  /** Cap on evidence items kept per technology. */
  maxEvidence?: number;
}

export function detectTechnologies(input: DetectInput, db: FingerprintDb, categories: CategoryDb, opts: DetectOptions = {}): TechnologyDetection[] {
  const maxEvidence = opts.maxEvidence ?? 8;
  const hits = new Map<string, { score: number; version: string | null; evidence: Evidence[]; implied: boolean }>();

  const add = (name: string, h: Hit) => {
    const cur = hits.get(name) ?? { score: 0, version: null, evidence: [], implied: false };
    cur.score = Math.min(100, cur.score + h.confidence);
    if (h.version && (!cur.version || h.version.length > cur.version.length)) cur.version = h.version;
    if (cur.evidence.length < maxEvidence && !cur.evidence.some((e) => e.pattern === h.evidence.pattern && e.source === h.evidence.source && e.key === h.evidence.key)) cur.evidence.push(h.evidence);
    hits.set(name, cur);
  };

  const cookieNames = new Map<string, string>();
  for (const c of input.cookies) {
    const name = c.split('=')[0]?.trim().toLowerCase();
    if (name) cookieNames.set(name, c);
  }
  const headerKeys = Object.keys(input.headers);
  const text = input.text ?? stripTags(input.html);

  for (const [name, fp] of Object.entries(db)) {
    // headers
    if (fp.headers) {
      for (const [h, p] of Object.entries(fp.headers)) {
        const hk = h.toLowerCase();
        const val = input.headers[hk];
        if (val === undefined) continue;
        const hit = testValue(p, val, 'header', hk);
        if (hit) add(name, hit);
      }
    }
    // cookies (names only; values are redacted)
    if (fp.cookies) {
      for (const [c, p] of Object.entries(fp.cookies)) {
        const cname = c.toLowerCase();
        const matchName = cookieNames.get(cname);
        if (matchName !== undefined) {
          const cp = compilePattern(p);
          // We cannot match cookie *values* (redacted); presence of the name counts.
          add(name, { confidence: cp.raw === '' ? cp.confidence : Math.min(cp.confidence, 50), version: null, evidence: { source: 'cookie', key: cname, value: 'cookie present', pattern: cp.raw || '(present)' } });
        }
      }
    }
    // html
    for (const p of arr(fp.html)) {
      const hit = testValue(p, input.html, 'html');
      if (hit) add(name, hit);
    }
    for (const p of arr(fp.text)) {
      const hit = testValue(p, text, 'text');
      if (hit) add(name, hit);
    }
    // script src
    for (const p of arr(fp.scriptSrc)) {
      for (const src of input.scriptSrc) {
        const hit = testValue(p, src, 'script-src');
        if (hit) {
          add(name, hit);
          break;
        }
      }
    }
    // script contents
    if (fp.scripts) {
      for (const p of arr(fp.scripts)) {
        for (const [src, body] of Object.entries(input.scripts)) {
          const hit = testValue(p, body, 'script-content', src);
          if (hit) {
            // A string inside someone else's bundle (e.g. "/wp-content" inside gtag.js) says
            // little about *this* site: cap it as low-confidence evidence.
            add(name, input.thirdPartyScripts?.has(src) ? { ...hit, confidence: Math.min(hit.confidence, 30) } : hit);
            break;
          }
        }
      }
    }
    // meta
    if (fp.meta) {
      for (const [m, ps] of Object.entries(fp.meta)) {
        const vals = input.meta[m.toLowerCase()];
        if (!vals) continue;
        for (const p of arr(ps)) {
          for (const v of vals) {
            const hit = testValue(p, v, 'meta', m.toLowerCase());
            if (hit) {
              add(name, hit);
              break;
            }
          }
        }
      }
    }
    // url
    for (const p of arr(fp.url)) {
      const hit = testValue(p, input.url, 'url');
      if (hit) add(name, hit);
    }
    // dns
    if (fp.dns) {
      for (const [type, ps] of Object.entries(fp.dns)) {
        const records = input.dns[type.toUpperCase()] ?? [];
        for (const p of arr(ps)) {
          for (const r of records) {
            const hit = testValue(p, r, 'dns', type.toUpperCase());
            if (hit) {
              add(name, hit);
              break;
            }
          }
        }
      }
    }
    // cert issuer
    if (fp.certIssuer && input.certIssuer) {
      const hit = testValue(fp.certIssuer, input.certIssuer, 'cert', 'issuer');
      if (hit) add(name, hit);
    }
    // js globals (browser stage)
    if (fp.js && input.js) {
      for (const [path, p] of Object.entries(fp.js)) {
        const v = input.js[path];
        if (v === undefined) continue;
        const hit = testValue(p, v, 'script-content', `window.${path}`);
        if (hit) add(name, hit);
      }
    }
    // xhr (browser stage)
    if (fp.xhr && input.xhr) {
      for (const p of arr(fp.xhr)) {
        for (const u of input.xhr) {
          const hit = testValue(p, u, 'url', 'xhr');
          if (hit) {
            add(name, hit);
            break;
          }
        }
      }
    }
    // dom
    if (fp.dom && input.dom) {
      const rules: [string, DomRule][] = typeof fp.dom === 'string' ? [[fp.dom, { exists: '' }]] : Array.isArray(fp.dom) ? fp.dom.map((s) => [s, { exists: '' }] as [string, DomRule]) : Object.entries(fp.dom);
      for (const [selector, rule] of rules) {
        let els: ArrayLike<DomElement>;
        try {
          els = input.dom.querySelectorAll(selector);
        } catch {
          continue;
        }
        if (els.length === 0) continue;
        if (rule.exists !== undefined) {
          const hit = testValue(rule.exists, 'exists', 'dom', selector);
          if (hit) add(name, { ...hit, evidence: { source: 'dom', key: selector, value: `${els.length} element(s)`, pattern: '(exists)' } });
        }
        if (rule.text) {
          for (let i = 0; i < Math.min(els.length, 20); i++) {
            const hit = testValue(rule.text, els[i]!.textContent ?? '', 'dom', selector);
            if (hit) {
              add(name, hit);
              break;
            }
          }
        }
        if (rule.attributes) {
          for (const [attr, p] of Object.entries(rule.attributes)) {
            for (let i = 0; i < Math.min(els.length, 20); i++) {
              const v = els[i]!.getAttribute(attr);
              if (v === null) continue;
              const hit = testValue(p, v, 'dom', `${selector}[${attr}]`);
              if (hit) {
                add(name, hit);
                break;
              }
            }
          }
        }
      }
    }
  }

  // requires / requiresCategory / excludes / implies
  const has = (n: string) => hits.has(n);
  const catOf = (n: string) => db[n]?.cats ?? [];
  for (const name of [...hits.keys()]) {
    const fp = db[name];
    if (!fp) continue;
    const req = arr(fp.requires).map((r) => compilePattern(r).raw);
    if (req.length && !req.every(has)) hits.delete(name);
    const reqCat = arr(fp.requiresCategory);
    if (reqCat.length && ![...hits.keys()].some((o) => o !== name && catOf(o).some((c) => reqCat.includes(c)))) hits.delete(name);
  }
  for (const name of [...hits.keys()]) {
    for (const ex of arr(db[name]?.excludes)) hits.delete(compilePattern(ex).raw);
  }
  // implies (transitive, bounded)
  let changed = true;
  let rounds = 0;
  while (changed && rounds++ < 5) {
    changed = false;
    for (const [name, h] of [...hits.entries()]) {
      for (const imp of arr(db[name]?.implies)) {
        const cp = compilePattern(imp);
        const target = cp.raw;
        if (!db[target] || hits.has(target)) continue;
        hits.set(target, { score: Math.min(h.score, cp.confidence), version: null, evidence: [{ source: 'implied', value: `implied by ${name}` }], implied: true });
        changed = true;
      }
    }
  }

  const out: TechnologyDetection[] = [];
  for (const [name, h] of hits) {
    const fp = db[name]!;
    out.push({
      name,
      slug: slugify(name),
      categories: fp.cats.map((id) => ({ id, name: categories[String(id)]?.name ?? 'Other' })),
      confidence: toConfidence(h.score),
      score: h.score,
      version: h.version,
      website: fp.website ?? null,
      description: fp.description ?? null,
      evidence: h.evidence,
      implied: h.implied,
      oss: fp.oss,
      saas: fp.saas
    });
  }
  const prio = (t: TechnologyDetection) => Math.min(...t.categories.map((c) => categories[String(c.id)]?.priority ?? 99));
  return out.sort((a, b) => b.score - a.score || prio(a) - prio(b) || a.name.localeCompare(b.name));
}

export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 200_000);
}
