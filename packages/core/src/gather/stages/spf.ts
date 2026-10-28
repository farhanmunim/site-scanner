import { cleanTxt, dohQuery } from '../doh.js';
import type { SpfInspection, SpfNode } from '../../types.js';

const MAX_DEPTH = 6;
const MAX_NODES = 30;
const LOOKUP_MECHANISMS = /^[+\-~?]?(include|a|mx|ptr|exists)(?=[:/]|$)/i;

export type TxtLookup = (name: string) => Promise<string[] | null>;

async function defaultTxt(name: string): Promise<string[] | null> {
  try {
    const r = await dohQuery(name, 'TXT');
    return r.status === 0 || r.status === 3 ? r.answers.map((a) => cleanTxt(a.data)) : null;
  } catch {
    return null;
  }
}

/**
 * Walk an SPF record the way a receiver would, counting the DNS lookups RFC 7208 limits to 10.
 * `txt` is injectable so the walk is testable without a network.
 */
export async function inspectSpf(domain: string, rootRecords: string[], txt: TxtLookup = defaultTxt): Promise<SpfInspection | null> {
  const spfRoot = rootRecords.filter((t) => /^v=spf1\b/i.test(t));
  if (!spfRoot.length) return null;

  let nodes = 0;
  let totalLookups = 0;
  let voidLookups = 0;
  let truncated = false;
  let ip4Count = 0;
  let ip6Count = 0;
  let hasPtr = false;
  let allQualifier: SpfInspection['allQualifier'] = null;
  const errors: string[] = [];
  const seen = new Set<string>();

  async function walk(name: string, record: string | null, via: SpfNode['via'], depth: number): Promise<SpfNode> {
    const node: SpfNode = { domain: name, record, via, lookups: 0, children: [] };
    nodes++;
    if (record === null) {
      const found = await txt(name);
      const spf = found?.filter((t) => /^v=spf1\b/i.test(t)) ?? [];
      if (!found || !spf.length) {
        voidLookups++;
        node.error = found ? 'No SPF record' : 'DNS lookup failed';
        errors.push(`${name}: ${node.error}`);
        return node;
      }
      if (spf.length > 1) {
        node.error = 'Multiple SPF records';
        errors.push(`${name}: ${node.error}`);
      }
      node.record = record = spf[0]!;
    }
    const terms = record.trim().split(/\s+/).slice(1);
    for (const raw of terms) {
      const term = raw.toLowerCase();
      if (/^[+\-~?]?ip4:/.test(term)) ip4Count++;
      else if (/^[+\-~?]?ip6:/.test(term)) ip6Count++;
      else if (/^[+\-~?]?ptr(?=[:/]|$)/.test(term)) hasPtr = true;
      if (/^[+\-~?]?all$/.test(term) && via === 'root') allQualifier = (/^[+\-~?]/.test(term) ? term[0] : '+') as SpfInspection['allQualifier'];
      if (LOOKUP_MECHANISMS.test(term) || /^redirect=/.test(term)) {
        node.lookups++;
        totalLookups++;
      }
    }
    for (const raw of terms) {
      const m = /^[+\-~?]?include:(.+)$/i.exec(raw);
      const r = /^redirect=(.+)$/i.exec(raw);
      const target = (m?.[1] ?? r?.[1])?.toLowerCase();
      if (!target || target.includes('%')) continue;
      if (seen.has(target)) {
        errors.push(`${target}: referenced more than once (possible loop)`);
        continue;
      }
      if (depth >= MAX_DEPTH || nodes >= MAX_NODES) {
        truncated = true;
        continue;
      }
      seen.add(target);
      node.children.push(await walk(target, null, m ? 'include' : 'redirect', depth + 1));
    }
    return node;
  }

  seen.add(domain.toLowerCase());
  const tree = await walk(domain, spfRoot[0]!, 'root', 0);
  if (spfRoot.length > 1) errors.unshift(`${domain}: ${spfRoot.length} SPF records (only one is allowed)`);
  return { tree, totalLookups, voidLookups, allQualifier, ip4Count, ip6Count, hasPtr, recordCount: spfRoot.length, truncated, errors };
}
