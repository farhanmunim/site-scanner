<script lang="ts">
  import type { Report, TechnologyDetection } from '@site-scanner/core/types';
  import Card from './Card.svelte';
  import { confWord, initials } from './helpers';
  let { report, open = false, failed = false }: { report: Report; open?: boolean; failed?: boolean } = $props();
  const notBuiltWith = /^(Webmail|Hosting|CDN|Miscellaneous|Email|Security|PaaS|IaaS|Reverse proxies|Load balancers|SSL\/TLS certificate authorities|Domain parking|Web servers)$/;
  const typeLabel = (t: TechnologyDetection) => (/ DNS$/.test(t.name) ? 'DNS provider' : t.categories.map((c) => c.name).join(', '));
  let filter = $state('');
  let techs = $derived(report.technologies.filter((t) => !filter || t.name.toLowerCase().includes(filter.toLowerCase()) || t.categories.some((c) => c.name.toLowerCase().includes(filter.toLowerCase()))));
  let anyVersion = $derived(report.technologies.some((t) => t.version));
  let tiles = $derived(report.technologies.filter((t) => !t.implied && t.confidence !== 'low' && !t.categories.every((c) => notBuiltWith.test(c.name))).slice(0, 18));
  const tone = { high: 'good', medium: 'warn', low: '' } as const;
</script>

<Card id="stack" title="Technology" desc="{report.technologies.length} detected: platform, CDN, analytics and third-party scripts identified from the page, headers and DNS." chip={report.technologies.length ? `${report.technologies.length} detected` : 'None found'}>
  {#if tiles.length}
    <div class="ss-tech">{#each tiles as t (t.slug)}<div><span class="ti" aria-hidden="true">{initials(t.name)}</span><div style="min-width: 0"><b>{t.name}{t.version ? ` ${t.version}` : ''}</b><small>{t.categories[0]?.name ?? 'Detected'}{t.confidence !== 'high' ? ` · ${confWord[t.confidence].toLowerCase()}` : ''}</small></div></div>{/each}</div>
  {:else if !report.technologies.length}
    <p class="ss-empty">{failed ? 'The page could not be loaded, so nothing could be identified.' : "Nothing could be identified with confidence. That doesn't mean the site uses no framework; the public response didn't give enough away."}</p>
  {/if}
  {#if report.technologies.length}
    <details class="ss-fold" {open}>
      <summary>All {report.technologies.length} technologies with confidence</summary>
      <div class="in">
        <input type="search" class="eui-input ss-filter no-print" placeholder="Filter…" bind:value={filter} aria-label="Filter technologies" />
        <div class="ss-tbl-wrap"><table class="ss-tbl">
          <thead><tr><th>Confidence</th><th>Name</th><th>Type</th>{#if anyVersion}<th>Version</th>{/if}</tr></thead>
          <tbody>
            {#each techs as t (t.slug)}
              <tr><td><span class="ss-chip {tone[t.confidence]}">{confWord[t.confidence]}</span></td><td>{#if t.website}<a href={t.website} rel="noopener nofollow" target="_blank">{t.name}</a>{:else}{t.name}{/if}{#if t.implied}<span class="ss-muted"> · implied</span>{/if}</td><td class="k">{typeLabel(t)}</td>{#if anyVersion}<td class="ss-mono">{t.version ?? '—'}</td>{/if}</tr>
            {:else}
              <tr><td colspan="4" class="ss-muted">Nothing matches that filter.</td></tr>
            {/each}
          </tbody>
        </table></div>
      </div>
    </details>
  {/if}
</Card>
