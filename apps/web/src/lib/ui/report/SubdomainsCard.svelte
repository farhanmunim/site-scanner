<script lang="ts">
  import type { Report } from '@site-scanner/core/types';
  import Card from './Card.svelte';
  let { report, running = false, open = false }: { report: Report; running?: boolean; open?: boolean } = $props();
  let subs = $derived(report.external.subdomains ?? null);
  let main = $derived(subs?.live ?? subs?.names ?? []);
  let gone = $derived(subs?.live ? subs.names.filter((n) => !subs!.live!.includes(n)) : []);
  let filter = $state('');
  let shown = $derived(main.filter((n) => !filter || n.includes(filter.toLowerCase().trim())));
  const FIRST = 45;
  const source = { 'ct-log': 'crt.sh, public Certificate Transparency logs', certspotter: 'Certspotter, public Certificate Transparency logs', hackertarget: 'HackerTarget, a passive DNS database' } as const;
</script>

<Card id="subdomains" title="Subdomains" desc="Hostnames under {report.target.registrableDomain} seen in public records{subs ? ` (${source[subs.source] ?? 'public records'})` : ''}{subs?.live ? ', checked against DNS now' : ''}. Nothing on the site itself was contacted." chip={subs ? (subs.live ? `${subs.live.length} live` : `${subs.total} found`) : running ? 'Checking…' : 'Unavailable'}>
  {#if subs}
    {#if subs.names.length}
      <div class="ss-row">
        <span class="ss-chip">{#if subs.live}{subs.live.length} live{gone.length ? ` · ${gone.length} no longer resolve` : ''}{:else}{subs.total} found{/if}{#if subs.total > subs.names.length} · first {subs.names.length} of {subs.total} checked{/if}</span>
        {#if main.length > 12}<input type="search" class="eui-input ss-filter no-print" style="margin: 0" placeholder="Filter subdomains…" bind:value={filter} aria-label="Filter subdomains" />{/if}
      </div>
      {#if subs.live && !subs.live.length}<p class="ss-note">None of the {subs.names.length} hostnames seen in public records currently resolve.</p>{/if}
      <div class="ss-subs">{#each (filter ? shown : shown.slice(0, FIRST)) as n (n)}<span>{n}</span>{:else}<span style="border: 0">Nothing matches that filter.</span>{/each}</div>
      {#if !filter && shown.length > FIRST}<details class="ss-fold" {open}><summary>Show {shown.length - FIRST} more</summary><div class="in ss-subs">{#each shown.slice(FIRST) as n (n)}<span>{n}</span>{/each}</div></details>{/if}
      {#if gone.length}<details class="ss-fold" {open}><summary>{gone.length} seen in public records but no longer resolve</summary><div class="in ss-subs">{#each gone as n (n)}<span class="gone">{n}</span>{/each}</div></details>{/if}
      {#if subs.wildcard}<p class="ss-note">This domain has a wildcard DNS record, so every name resolves and there is no way to tell which of these hosts are real.</p>{/if}
      {#if subs.unverified}<p class="ss-note">{subs.unverified} name{subs.unverified === 1 ? '' : 's'} could not be checked in time and {subs.unverified === 1 ? 'is' : 'are'} not shown as live.</p>{/if}
    {:else}
      <p class="ss-empty">No other hostnames appear in Certificate Transparency logs for this domain.</p>
    {/if}
  {:else if running}
    <div class="ss-cardstate"><span class="ss-spin"></span>Querying Certificate Transparency logs…</div>
  {:else}
    <p class="ss-empty"><b>Subdomains unavailable for this scan.</b> The Certificate Transparency source did not answer in time, or external lookups are switched off. Scan again to retry.</p>
  {/if}
</Card>
