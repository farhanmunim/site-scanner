#!/usr/bin/env node
// Downloads the open Wappalyzer-format fingerprint database (enthec/webappanalyzer, GPL-3.0)
// and writes a pruned copy into packages/core/src/analyze/detect/data/. The data is fetched at
// build time rather than committed so the upstream licence and freshness stay clear.
//
// Usage: node scripts/fetch-fingerprints.mjs [--force]
//   FINGERPRINTS_REF=<git ref>  pin to a commit/tag (default: main)
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'packages/core/src/analyze/detect/data');
const ref = process.env.FINGERPRINTS_REF || 'main';
const base = `https://raw.githubusercontent.com/enthec/webappanalyzer/${ref}/src`;
const force = process.argv.includes('--force');

// Fields the detection engine uses (js/xhr need the browser stage; the rest are static).
const KEEP = [
  'cats', 'website', 'description', 'headers', 'cookies', 'html', 'text', 'scriptSrc',
  'meta', 'url', 'dns', 'dom', 'implies', 'excludes', 'requires', 'requiresCategory',
  'certIssuer', 'cpe', 'oss', 'saas', 'scripts', 'js', 'xhr'
];

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

const target = join(outDir, 'fingerprints.json');
if (!force && (await exists(target))) {
  console.log('fingerprints already present (use --force to refresh)');
  process.exit(0);
}

const files = ['_', ...'abcdefghijklmnopqrstuvwxyz'];
const technologies = {};
for (const f of files) {
  const data = await getJson(`${base}/technologies/${f}.json`);
  for (const [name, tech] of Object.entries(data)) {
    const pruned = {};
    for (const k of KEEP) if (tech[k] !== undefined) pruned[k] = tech[k];
    if (typeof pruned.description === 'string' && pruned.description.length > 200) {
      pruned.description = pruned.description.slice(0, 197) + '...';
    }
    technologies[name] = pruned;
  }
}
const categories = await getJson(`${base}/categories.json`);

await mkdir(outDir, { recursive: true });
await writeFile(target, JSON.stringify(technologies));
await writeFile(join(outDir, 'categories.json'), JSON.stringify(categories));
await writeFile(
  join(outDir, 'SOURCE.json'),
  JSON.stringify({ source: 'https://github.com/enthec/webappanalyzer', license: 'GPL-3.0', ref, fetchedAt: new Date().toISOString(), count: Object.keys(technologies).length }, null, 2)
);
console.log(`wrote ${Object.keys(technologies).length} technologies, ${Object.keys(categories).length} categories`);
