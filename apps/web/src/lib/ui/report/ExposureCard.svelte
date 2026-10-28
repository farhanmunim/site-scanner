<script lang="ts">
  import type { Report } from '@site-scanner/core/types';
  import Card from './Card.svelte';
  import Findings from './Findings.svelte';
  import { rollup } from './helpers';
  let { report, open = false, running = false }: { report: Report; open?: boolean; running?: boolean } = $props();
  let x = $derived(report.exposure);
  let known = $derived((x?.hosts ?? []).filter((h) => h.known));
  let portCount = $derived(new Set(known.flatMap((h) => h.ports)).size);
  let cveCount = $derived(new Set(known.flatMap((h) => h.vulns)).size);
  let r = $derived(rollup(x?.findings, running ? 'Looking up…' : x ? 'No data' : 'Not assessed'));
  let place = $derived([x?.geo?.city, x?.geo?.region, x?.geo?.country].filter(Boolean).join(', '));
</script>

<Card id="ports" title="Open ports and exposure" desc="What public internet scanners already know about this site's addresses. Nothing here was probed by us." chip={r.label} tone={r.tone}>
  {#if x}
    <div class="ss-tiles">
      <div class="ss-tile"><div class="k">Open ports</div><div class="v">{known.length ? portCount : '—'}</div><div class="t">{x.sharedEdge ? 'CDN / firewall edge' : known.length ? `${known.length} address${known.length === 1 ? '' : 'es'}` : 'not indexed'}</div></div>
      <div class="ss-tile {cveCount && !x.sharedEdge ? 'warn' : ''}"><div class="k">Banner CVEs</div><div class="v">{known.length && !x.sharedEdge ? cveCount : '—'}</div><div class="t">{x.sharedEdge ? 'not attributable behind a CDN' : 'to verify, may be patched'}</div></div>
      <div class="ss-tile"><div class="k">Server location</div><div class="v" style="font-size: var(--text-base)">{place || '—'}</div><div class="t">{x.geo?.ip ?? ''}</div></div>
      <div class="ss-tile"><div class="k">Popularity</div><div class="v">{x.rank?.rank ? `#${x.rank.rank.toLocaleString('en-GB')}` : '—'}</div><div class="t">{x.rank ? (x.rank.rank ? 'Tranco top 1 million' : 'outside the top 1 million') : ''}</div></div>
    </div>
    {#if x.findings.length}<Findings findings={x.findings} {open} />{/if}
    {#if known.length}
      <details class="ss-fold" {open}>
        <summary>Addresses and ports ({known.length})</summary>
        <div class="in ss-tbl-wrap"><table class="ss-tbl">
          <thead><tr><th>Address</th><th>Ports</th><th>Software seen</th></tr></thead>
          <tbody>{#each known as h (h.ip)}<tr><td class="ss-mono">{h.ip}{#if h.hostnames[0]}<div class="ss-muted">{h.hostnames[0]}</div>{/if}</td><td class="ss-mono">{h.ports.join(', ') || '—'}</td><td>{h.cpes.map((c) => c.replace(/^cpe:\/[a-z]:/, '').replaceAll(':', ' ')).slice(0, 5).join(', ') || '—'}</td></tr>{/each}</tbody>
        </table></div>
      </details>
    {/if}
    <p class="ss-note">Source: Shodan InternetDB (passive). Data can be days old and covers only what the scanner reached.</p>
  {:else}
    <p class="ss-empty">{running ? 'Looking up the site’s addresses…' : 'No port data was available for this site.'}</p>
  {/if}
</Card>
