import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CategoryDb, FingerprintDb } from './engine.js';

export * from './engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let cache: { db: FingerprintDb; categories: CategoryDb; version: string | null } | null = null;

/**
 * Loads the fetched Wappalyzer-format database (GPL-3.0, enthec/webappanalyzer) merged
 * with our own overrides. The file is produced by `pnpm fingerprints`.
 */
export function loadFingerprints(): { db: FingerprintDb; categories: CategoryDb; version: string | null } {
  if (cache) return cache;
  const dataDir = join(here, 'data');
  const fpPath = join(dataDir, 'fingerprints.json');
  if (!existsSync(fpPath)) {
    throw new Error(`Fingerprint database missing at ${fpPath}. Run "pnpm fingerprints" first.`);
  }
  const db = JSON.parse(readFileSync(fpPath, 'utf8')) as FingerprintDb;
  const categories = JSON.parse(readFileSync(join(dataDir, 'categories.json'), 'utf8')) as CategoryDb;
  const overrides = require('./overrides.json') as FingerprintDb;
  for (const [name, fp] of Object.entries(overrides)) {
    const base = db[name];
    db[name] = base ? mergeFingerprint(base, fp) : fp;
  }
  let version: string | null = null;
  try {
    const src = JSON.parse(readFileSync(join(dataDir, 'SOURCE.json'), 'utf8')) as { fetchedAt?: string; ref?: string };
    version = src.fetchedAt ? `${src.ref ?? 'main'}@${src.fetchedAt.slice(0, 10)}` : null;
  } catch {
    /* optional */
  }
  cache = { db, categories, version };
  return cache;
}

function mergeFingerprint(a: FingerprintDb[string], b: FingerprintDb[string]): FingerprintDb[string] {
  const out = { ...a, ...b };
  for (const k of ['headers', 'cookies', 'meta', 'dns', 'js'] as const) {
    if (a[k] || b[k]) out[k] = { ...(a[k] as object), ...(b[k] as object) } as never;
  }
  for (const k of ['html', 'scriptSrc', 'scripts', 'url', 'implies', 'dom', 'xhr', 'text'] as const) {
    const av = a[k];
    const bv = b[k];
    if (av === undefined && bv === undefined) continue;
    if (typeof av === 'object' && !Array.isArray(av) && av !== null) continue; // dom object form: keep override
    out[k] = [...(Array.isArray(av) ? av : av ? [av] : []), ...(Array.isArray(bv) ? bv : bv ? [bv] : [])] as never;
  }
  return out;
}
