<script lang="ts">
  import { fmtDate } from '$lib/format';
  let { data } = $props();
</script>

<svelte:head><title>Admin — lookups</title></svelte:head>
<h1>Lookups</h1>
<p class="muted small">Every request, including cache hits and refusals. Raw IPs are cleared after the retention window; the hash remains for grouping.</p>
<form class="row" style="margin-bottom: 12px"><input type="search" name="q" placeholder="Search input, host, IP or hash" value={data.q} style="max-width: 360px" /><button class="secondary" type="submit">Search</button></form>
<div class="card table-wrap">
  <table>
    <thead><tr><th>When</th><th>Input</th><th>Result</th><th>Requester</th><th>UA / referrer</th></tr></thead>
    <tbody>
      {#each data.rows as l}
        <tr>
          <td class="small">{fmtDate(l.createdAt, true)}</td>
          <td class="mono small">{l.input}</td>
          <td class="small">{#if l.refusedReason}<span class="pill bad">refused</span> {l.refusedReason}{:else if l.scanId}<a href="/r/{l.scanId}">{l.cacheHit ? 'cached' : 'scan'}</a>{:else}—{/if}</td>
          <td class="small mono">{l.ip ?? l.ipHash?.slice(0, 12)}{#if l.country} · {l.country}{/if} · {l.source}</td>
          <td class="small muted" style="max-width: 320px; overflow-wrap: anywhere">{l.userAgent?.slice(0, 90) ?? ''}{#if l.referrer}<br />{l.referrer.slice(0, 90)}{/if}</td>
        </tr>
      {:else}<tr><td colspan="5" class="muted">No lookups yet.</td></tr>{/each}
    </tbody>
  </table>
</div>
<div class="row" style="margin-top: 10px">{#if data.page > 1}<a class="button secondary" href="?q={encodeURIComponent(data.q)}&page={data.page - 1}">Newer</a>{/if}{#if data.more}<a class="button secondary" href="?q={encodeURIComponent(data.q)}&page={data.page + 1}">Older</a>{/if}</div>
