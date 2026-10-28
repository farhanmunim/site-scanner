import { compareVersions } from '../version.js';
import type { RetireLibrary, VulnerableLibrary } from '../types.js';

/** retire.js repository entry as published in RetireJS/retire.js (repository/jsrepository.json). */
export interface RetireRepoEntry {
  vulnerabilities?: { atOrAbove?: string; below?: string; severity?: string; cwe?: string[]; identifiers?: { CVE?: string[]; summary?: string }; info?: string[] }[];
  extractors?: { uri?: string[]; filename?: string[]; filecontent?: string[] };
}

const VERSION = '[0-9][0-9.a-z_\\-]+';

function toRegExp(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern.replace(/§§version§§/g, VERSION), 'i');
  } catch {
    return null;
  }
}

export function normaliseRepo(repo: Record<string, RetireRepoEntry>): RetireLibrary[] {
  return Object.entries(repo).map(([name, e]) => ({
    name,
    vulns: (e.vulnerabilities ?? []).map((v) => ({ atOrAbove: v.atOrAbove, below: v.below, severity: v.severity, cve: v.identifiers?.CVE, summary: v.identifiers?.summary })),
    uri: e.extractors?.uri ?? [],
    filename: e.extractors?.filename ?? [],
    filecontent: e.extractors?.filecontent ?? []
  }));
}

const cmp = compareVersions;

export interface LibraryMatch {
  library: string;
  version: string;
  source: string;
}

/** Identify libraries from script URLs and script bodies. Pure. */
export function identifyLibraries(libs: RetireLibrary[], urls: string[], bodies: { source: string; body: string }[]): LibraryMatch[] {
  const found = new Map<string, LibraryMatch>();
  const add = (library: string, version: string | undefined, source: string) => {
    // The version pattern is greedy, so "3.4.1.min" or "2.0-" can slip in from file names.
    version = version?.replace(/[.\-_]?min$/i, '').replace(/[.\-_]+$/, '');
    if (!version) return;
    const key = `${library}@${version}`;
    if (!found.has(key)) found.set(key, { library, version, source });
  };
  for (const lib of libs) {
    const uriRes = lib.uri.map(toRegExp).filter((r): r is RegExp => !!r);
    const nameRes = lib.filename.map(toRegExp).filter((r): r is RegExp => !!r);
    const contentRes = lib.filecontent.map(toRegExp).filter((r): r is RegExp => !!r);
    for (const rawUrl of urls) {
      const url = rawUrl.length > 2048 ? rawUrl.slice(0, 2048) : rawUrl;
      for (const r of uriRes) add(lib.name, r.exec(url)?.[1], url);
      const file = url.split(/[?#]/)[0]!.split('/').pop() ?? '';
      for (const r of nameRes) add(lib.name, r.exec(file)?.[1], url);
    }
    for (const b of bodies) for (const r of contentRes) add(lib.name, r.exec(b.body.slice(0, 30_000))?.[1], b.source);
  }
  return [...found.values()];
}

export function vulnerabilitiesFor(lib: RetireLibrary, version: string): VulnerableLibrary['vulns'] {
  return lib.vulns
    .filter((v) => (!v.below || cmp(version, v.below) < 0) && (!v.atOrAbove || cmp(version, v.atOrAbove) >= 0))
    .map((v) => ({ severity: v.severity ?? null, summary: v.summary ?? null, cves: v.cve ?? [], below: v.below ?? null, atOrAbove: v.atOrAbove ?? null }));
}

export function findVulnerableLibraries(libs: RetireLibrary[], urls: string[], bodies: { source: string; body: string }[]): VulnerableLibrary[] {
  const byName = new Map(libs.map((l) => [l.name, l]));
  const out: VulnerableLibrary[] = [];
  for (const m of identifyLibraries(libs, urls, bodies)) {
    const lib = byName.get(m.library)!;
    const vulns = vulnerabilitiesFor(lib, m.version);
    if (vulns.length) out.push({ name: m.library, version: m.version, source: m.source, vulns });
  }
  return out;
}
