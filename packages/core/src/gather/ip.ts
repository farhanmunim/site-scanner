import ipaddr from 'ipaddr.js';

/**
 * SSRF guard. Every IP a target resolves to (and every redirect hop) is checked here
 * before any request is made. On Cloudflare Workers there is no private network to
 * reach, but the rule stays: the scanner must never be usable as a proxy into
 * anything that isn't a public website.
 */

const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT / Tailscale
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local + cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay (deprecated)
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4] // reserved + broadcast
];

const BLOCKED_V6: [string, number][] = [
  ['::', 96], // unspecified, loopback and IPv4-compatible (::a.b.c.d)
  ['::ffff:0:0:0', 96], // SIIT (::ffff:0:a.b.c.d)
  ['3fff::', 20], // documentation
  ['5f00::', 16], // SRv6 SIDs
  ['2001:20::', 28], // ORCHIDv2
  ['::1', 128], // loopback
  ['::ffff:0:0', 96], // IPv4-mapped (checked via v4 rules too)
  ['64:ff9b::', 96], // NAT64
  ['64:ff9b:1::', 48], // local-use NAT64
  ['100::', 64], // discard
  ['2001::', 32], // Teredo
  ['2001:2::', 48], // benchmarking
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local (deprecated)
  ['ff00::', 8] // multicast
];

export interface IpCheck {
  ok: boolean;
  reason?: string;
}

/**
 * @param extraBlocked additional literal IPs to refuse (e.g. our own egress / origin IPs).
 */
export function checkIp(ip: string, extraBlocked: ReadonlySet<string> = new Set()): IpCheck {
  let addr: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    addr = ipaddr.process(ip); // converts IPv4-mapped v6 to v4
  } catch {
    return { ok: false, reason: 'unparseable address' };
  }
  if (extraBlocked.has(addr.toString()) || extraBlocked.has(ip)) return { ok: false, reason: 'address is on the local blocklist' };

  if (addr.kind() === 'ipv4') {
    for (const [net, bits] of BLOCKED_V4) {
      if (addr.match(ipaddr.IPv4.parse(net), bits)) return { ok: false, reason: `non-public IPv4 range ${net}/${bits}` };
    }
    return { ok: true };
  }
  const v6 = addr as ipaddr.IPv6;
  for (const [net, bits] of BLOCKED_V6) {
    if (v6.match(ipaddr.IPv6.parse(net), bits)) return { ok: false, reason: `non-public IPv6 range ${net}/${bits}` };
  }
  return { ok: true };
}

export function isPublicIp(ip: string, extraBlocked?: ReadonlySet<string>): boolean {
  return checkIp(ip, extraBlocked).ok;
}

export function ipVersion(ip: string): 4 | 6 | null {
  try {
    return ipaddr.parse(ip).kind() === 'ipv4' ? 4 : 6;
  } catch {
    return null;
  }
}

/** Reverse-lookup name for an IP (in-addr.arpa / ip6.arpa). */
export function reverseName(ip: string): string | null {
  try {
    const addr = ipaddr.parse(ip);
    if (addr.kind() === 'ipv4') return addr.toByteArray().reverse().join('.') + '.in-addr.arpa';
    const hex = (addr as ipaddr.IPv6)
      .toByteArray()
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return hex.split('').reverse().join('.') + '.ip6.arpa';
  } catch {
    return null;
  }
}
