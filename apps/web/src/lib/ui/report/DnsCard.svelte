<script lang="ts">
  import type { IpInfo, Report } from '@site-scanner/core/types';
  import Card from './Card.svelte';
  import { confWord, dot } from './helpers';
  let { report, open = false, running = false }: { report: Report; open?: boolean; running?: boolean } = $props();
  const ipLine = (ip: IpInfo) => dot(ip.ip, ip.asn ? `AS${ip.asn}${ip.asnOrg ? ` ${ip.asnOrg}` : ''}` : null, ip.country, ip.reverseDns);
  let ipGroups = $derived.by(() => {
    const groups = new Map<string, { label: string; ips: IpInfo[] }>();
    for (const ip of report.infra.ips) {
      const key = ip.asn ? `AS${ip.asn}` : (ip.asnOrg ?? 'unknown');
      const label = dot(ip.asn ? `AS${ip.asn}${ip.asnOrg ? ` ${ip.asnOrg}` : ''}` : (ip.asnOrg ?? 'Unknown network'), ip.country);
      const g = groups.get(key) ?? { label, ips: [] };
      g.ips.push(ip);
      groups.set(key, g);
    }
    return [...groups.values()];
  });
  let serverLine = $derived.by(() => {
    const s = report.http?.server;
    let base = 'Not disclosed';
    if (s) base = report.infra.cdn && new RegExp(report.infra.cdn.name.split(' ')[0]!, 'i').test(s) ? `Not disclosed (behind ${report.infra.cdn.name})` : s;
    return dot(base, report.http?.poweredBy);
  });
  let prop = $derived(report.propagation);
  let differing = $derived(prop?.rows.filter((r) => !r.consistent).map((r) => r.type) ?? []);
  let resolvers = $derived(prop?.rows[0]?.answers.map((a) => a.resolver) ?? []);
  const cell = (v: string[] | null) => (v === null ? null : v);
  let dnsCount = $derived(report.dns ? report.dns.A.length + report.dns.AAAA.length + report.dns.CNAME.length + report.dns.NS.length + report.dns.MX.length + report.dns.TXT.length + report.dns.CAA.length : 0);
</script>

<Card id="dns" title="Hosting & DNS" desc="A CDN hides where a site is really hosted. We only name a host when there is evidence for it." chip={differing.length ? `${differing.join(', ')} differ` : prop ? 'Resolvers agree' : null} tone={differing.length ? 'warn' : prop ? 'good' : ''}>
  <dl class="ss-kv">
    <dt>CDN / reverse proxy</dt><dd>{report.infra.cdn?.name ?? 'None seen'}</dd>
    <dt>Firewall</dt><dd>{report.infra.waf?.name ?? 'None seen'}</dd>
    <dt>Hosting provider</dt>
    <dd>{#if report.infra.hosting}{report.infra.hosting.name} <span class="ss-chip">{confWord[report.infra.hosting.confidence]}</span>{:else if report.infra.cdn}Not publicly visible<span class="sub">Served through {report.infra.cdn.name}, which hides the real server.</span>{:else}Unknown{/if}</dd>
    <dt>Web server</dt><dd>{serverLine}</dd>
    {#if ipGroups.length}
      <dt>IP addresses</dt>
      <dd>{#each ipGroups as g (g.label)}<div>{g.ips.length} address{g.ips.length === 1 ? '' : 'es'} · {g.label}<span class="sub ss-mono">{dot(g.ips.find((i) => i.version === 4)?.ip, g.ips.find((i) => i.version === 6)?.ip, g.ips.length > 2 ? `+${g.ips.length - 2} more` : null)}</span></div>{/each}</dd>
    {/if}
    <dt>DNS provider</dt><dd>{report.infra.dnsProvider?.name ?? '—'}</dd>
    {#if report.external.greenHosting}<dt>Green hosting</dt><dd>{report.external.greenHosting.green ? `Yes: ${report.external.greenHosting.hostedBy ?? 'listed by the Green Web Foundation'}` : 'Not listed by the Green Web Foundation'}</dd>{/if}
  </dl>

  {#if prop}
    <div>
      <div class="sub-h">Propagation across {resolvers.length} public resolvers</div>
      <div class="ss-prop" tabindex="0" role="region" aria-label="DNS answers from each resolver (scrollable)"><table>
        <thead><tr><th>Record</th>{#each resolvers as rs}<th title={rs.ip}>{rs.name}</th>{/each}</tr></thead>
        <tbody>
          {#each prop.rows as row (row.type)}
            <tr>
              <td class="ty"><span class="dot" class:diff={!row.consistent}></span>{row.type}</td>
              {#each row.answers as a (a.resolver.ip)}
                {@const v = cell(a.values)}
                <td class:none={!v || !v.length}>{#if v === null}no answer{:else if !v.length}empty{:else}{#each v.slice(0, 3) as x}<div>{x.length > 60 ? x.slice(0, 57) + '…' : x}</div>{/each}{#if v.length > 3}<div class="ss-muted">+{v.length - 3} more</div>{/if}{/if}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table></div>
      {#each prop.rows.filter((r) => r.note) as r}<p class="ss-note" style="margin-top: 8px"><b>{r.type}:</b> {r.note}</p>{/each}
      {#if prop.rows.some((r) => r.answers.some((a) => a.values !== null))}<p class="ss-note" style="margin-top: 8px">{differing.length ? 'Rows marked amber differ between resolvers. A change that is still propagating looks like this; sites behind a CDN also legitimately return different addresses by region.' : 'Every resolver that answered returned the same records.'}</p>{/if}
    </div>
  {:else if running}
    <div class="ss-cardstate"><span class="ss-spin"></span>Querying resolvers…</div>
  {/if}

  {#if report.infra.ips.length > 2}
    <details class="ss-fold" {open}><summary>All {report.infra.ips.length} IP addresses</summary><div class="in ss-tbl-wrap"><table class="ss-tbl"><tbody>{#each report.infra.ips as ip (ip.ip)}<tr><td class="ss-mono">{ipLine(ip)}</td></tr>{/each}</tbody></table></div></details>
  {/if}
  {#if (report.http?.chain && report.http.chain.length > 1) || Object.keys(report.http?.cacheHeaders ?? {}).length}
    <details class="ss-fold" {open}>
      <summary>Response details: redirects and caching</summary>
      <div class="in"><dl class="ss-kv">
        {#if report.http?.chain && report.http.chain.length > 1}<dt>Redirects</dt><dd>{#each report.http.chain as hop}<div class="ss-mono">{hop.location ? `${hop.status} ${hop.url} → ${hop.location}` : `${hop.status} ${hop.url}`}</div>{/each}</dd>{/if}
        {#if Object.keys(report.http?.cacheHeaders ?? {}).length}<dt>Caching</dt><dd>{#each Object.entries(report.http?.cacheHeaders ?? {}) as [k, v]}<div class="ss-mono">{k}: {v}</div>{/each}</dd>{/if}
      </dl></div>
    </details>
  {/if}
  {#if report.dns}
    <details class="ss-fold" {open}>
      <summary>{dnsCount} DNS records</summary>
      <div class="in ss-tbl-wrap"><table class="ss-tbl">
        <thead><tr><th style="width: 80px">Type</th><th>Value</th></tr></thead>
        <tbody>
          {#each report.dns.A as v}<tr><td class="ss-mono">A</td><td class="ss-mono">{v}</td></tr>{/each}
          {#each report.dns.AAAA as v}<tr><td class="ss-mono">AAAA</td><td class="ss-mono">{v}</td></tr>{/each}
          {#each report.dns.CNAME as v}<tr><td class="ss-mono">CNAME</td><td class="ss-mono">{v}</td></tr>{/each}
          {#each report.dns.NS as v}<tr><td class="ss-mono">NS</td><td class="ss-mono">{v}</td></tr>{/each}
          {#each report.dns.MX as v}<tr><td class="ss-mono">MX</td><td class="ss-mono">{v.priority} {v.exchange}</td></tr>{/each}
          {#each report.dns.CAA as v}<tr><td class="ss-mono">CAA</td><td class="ss-mono">{v}</td></tr>{/each}
          {#each report.dns.TXT as v}<tr><td class="ss-mono">TXT</td><td class="ss-mono">{v}</td></tr>{/each}
        </tbody>
      </table></div>
    </details>
  {/if}
</Card>
