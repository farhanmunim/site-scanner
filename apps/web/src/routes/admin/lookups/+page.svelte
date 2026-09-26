<script lang="ts">
  import { fmtDate } from '$lib/format';
  let { data } = $props();
</script>

<svelte:head><title>Admin — lookups</title></svelte:head>

<div class="page-head">
  <h1>Lookups</h1>
  <p class="lead">Every request, including cache hits and refusals. Raw IPs are cleared after the retention window; the hash stays for grouping.</p>
</div>

<form class="toolbar" role="search">
  <input type="search" name="q" placeholder="Search input, host, IP or hash" value={data.q} aria-label="Search lookups" />
  <button class="secondary" type="submit">Search</button>
</form>

<div class="panel">
  <div class="table-wrap">
    <table class="wide-table">
      <thead><tr><th>When</th><th>Input</th><th>Result</th><th>Requester</th><th>Browser / referrer</th></tr></thead>
      <tbody>
        {#each data.rows as l}
          <tr>
            <td class="muted nowrap">{fmtDate(l.createdAt, true)}</td>
            <td class="mono small">{l.input}</td>
            <td>{#if l.refusedReason}<span class="pill red">refused</span> <span class="small muted">{l.refusedReason}</span>{:else if l.scanId}<a href="/r/{l.scanId}">{l.cacheHit ? 'cached' : 'scan'}</a>{:else}—{/if}</td>
            <td class="mono small nowrap">{[l.ip ?? l.ipHash?.slice(0, 12), l.country, l.source].filter(Boolean).join(' · ')}</td>
            <td class="small muted ua">{l.userAgent?.slice(0, 90) ?? ''}{#if l.referrer}<br />{l.referrer.slice(0, 90)}{/if}</td>
          </tr>
        {:else}<tr><td colspan="5" class="muted">No lookups yet.</td></tr>{/each}
      </tbody>
    </table>
  </div>
</div>
{#if data.page > 1 || data.more}
  <div class="pager">
    {#if data.page > 1}<a class="button secondary sm" href="?q={encodeURIComponent(data.q)}&page={data.page - 1}">Newer</a>{/if}
    <span class="muted small">Page {data.page}</span>
    {#if data.more}<a class="button secondary sm" href="?q={encodeURIComponent(data.q)}&page={data.page + 1}">Older</a>{/if}
  </div>
{/if}
