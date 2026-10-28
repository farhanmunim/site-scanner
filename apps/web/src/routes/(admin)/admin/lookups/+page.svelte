<script lang="ts">
  import { fmtDate } from '$lib/format';
  import Icon from '$lib/ui/Icon.svelte';
  let { data } = $props();
</script>

<svelte:head><title>Admin: lookups</title></svelte:head>

<div class="ad-head"><div><span class="eui-eyebrow">Admin</span><h1>Lookups</h1><p>Every request, including cache hits and refusals. Raw IPs are cleared after the retention window; the hash stays for grouping.</p></div></div>

<form class="ad-toolbar" role="search">
  <input type="search" name="q" class="eui-input" placeholder="Search input, host, IP or hash" value={data.q} aria-label="Search lookups" />
  <button class="eui-btn outline" type="submit"><Icon name="search" size={14} />Search</button>
</form>

<section class="ad-card">
  <div class="ad-table-wrap">
    <table class="ad-table">
      <thead><tr><th class="hide-sm">When</th><th>Input</th><th>Result</th><th class="hide-sm">Requester</th><th class="hide-sm">Browser / referrer</th></tr></thead>
      <tbody>
        {#each data.rows as l}
          <tr>
            <td class="muted nowrap hide-sm">{fmtDate(l.createdAt, true)}</td>
            <td class="mono">{l.input}</td>
            <td>{#if l.refusedReason}<span class="ss-chip bad">refused</span> <span class="sm muted">{l.refusedReason}</span>{:else if l.scanId}<a href="/r/{l.scanId}">{l.cacheHit ? 'cached' : 'scan'}</a>{:else}—{/if}</td>
            <td class="mono nowrap hide-sm">{[l.ip ?? l.ipHash?.slice(0, 12), l.country, l.source].filter(Boolean).join(' · ')}</td>
            <td class="sm muted ua hide-sm">{l.userAgent?.slice(0, 90) ?? ''}{#if l.referrer}<br />{l.referrer.slice(0, 90)}{/if}</td>
          </tr>
        {:else}<tr><td colspan="5" class="empty">No lookups yet.</td></tr>{/each}
      </tbody>
    </table>
  </div>
</section>
{#if data.page > 1 || data.more}
  <div class="ad-pager">
    {#if data.page > 1}<a class="eui-btn outline sm" href="?q={encodeURIComponent(data.q)}&page={data.page - 1}">Newer</a>{/if}
    <span>Page {data.page}</span>
    {#if data.more}<a class="eui-btn outline sm" href="?q={encodeURIComponent(data.q)}&page={data.page + 1}">Older</a>{/if}
  </div>
{/if}
