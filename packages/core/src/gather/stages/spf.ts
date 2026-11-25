import { cleanTxt, dohQuery } from '../doh.js';
import type { SpfInspection, SpfNode } from '../../types.js';

const MAX_DEPTH = 6;
const MAX_NODES = 40;
const OVERALL_DEADLINE_MS = 20_000;
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

  const deadline = Date.now() + OVERALL_DEADLINE_MS;
  const memo = new Map<string, Promise<string[] | null>>();
  const lookup = (name: string) => {
    if (Date.now() > deadline) return Promise.resolve(null);
    let p = memo.get(name);
    if (!p) memo.set(name, (p = txt(name)));
    return p;
  };
  let nodes = 0;
  let totalLookups = 0;
  let voidLookups = 0;
  let truncated = false;
  let ip4Count = 0;
  let ip6Count = 0;
  let hasPtr = false;
  let allQualifier: SpfInspection['allQualifier'] = null;
  const errors: string[] = [];
  const path = new Set<string>();

  /** `effective` = this record decides the final result (the root, or a redirect= target reached because nothing earlier had `all`). */
  async function walk(name: string, record: string | null, via: SpfNode['via'], depth: number, effective: boolean): Promise<SpfNode> {
    const node: SpfNode = { domain: name, record, via, lookups: 0, children: [] };
    nodes++;
    if (record === null) {
      const found = await lookup(name);
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
    // RFC 7208 §6.1: redirect= is ignored when the record has an `all` mechanism.
    const hasAll = record.trim().split(/\s+/).slice(1).some((t) => /^[+\-~?]?all$/i.test(t));
    const terms = record.trim().split(/\s+/).slice(1).filter((t) => !(hasAll && /^redirect=/i.test(t)));
    for (const raw of terms) {
      const term = raw.toLowerCase();
      if (/^[+\-~?]?ip4:/.test(term)) ip4Count++;
      else if (/^[+\-~?]?ip6:/.test(term)) ip6Count++;
      else if (/^[+\-~?]?ptr(?=[:/]|$)/.test(term)) hasPtr = true;
      if (/^[+\-~?]?all$/.test(term) && effective) allQualifier = (/^[+\-~?]/.test(term) ? term[0] : '+') as SpfInspection['allQualifier'];
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
      // A name already on the current path is a real loop. A name reached by two branches is legal and
      // counts again, because a receiver evaluates (and counts) every occurrence.
      if (path.has(target)) {
        errors.push(`${target}: includes itself (loop)`);
        continue;
      }
      if (depth >= MAX_DEPTH || nodes >= MAX_NODES) {
        truncated = true;
        continue;
      }
      path.add(target);
      node.children.push(await walk(target, null, m ? 'include' : 'redirect', depth + 1, effective && !m));
      path.delete(target);
    }
    return node;
  }

  path.add(domain.toLowerCase());
  const tree = await walk(domain, spfRoot[0]!, 'root', 0, true);
  if (spfRoot.length > 1) errors.unshift(`${domain}: ${spfRoot.length} SPF records (only one is allowed)`);
  return { tree, totalLookups, voidLookups, allQualifier, ip4Count, ip6Count, hasPtr, recordCount: spfRoot.length, truncated, errors };
}
