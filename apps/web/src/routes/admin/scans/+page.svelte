<script lang="ts">
  import { enhance } from '$app/forms';
  import { fmtDate, fmtMs } from '$lib/format';
  let { data, form } = $props();
  const statusClass = (s: string) => (s === 'complete' ? 'green' : s === 'failed' ? 'red' : 'amber');
</script>

<svelte:head><title>Admin — scans</title></svelte:head>

<div class="page-head">
  <h1>Scans</h1>
  <p class="lead">Every stored report. Re-scan runs a fresh scan and bypasses the cache.</p>
</div>

<form class="toolbar">
  <input type="search" name="q" placeholder="Host" value={data.q} aria-label="Filter by host" />
  <select name="status" aria-label="Status"><option value="">Any status</option>{#each ['complete', 'partial', 'restricted', 'failed', 'queued', 'running'] as s}<option value={s} selected={data.status === s}>{s}</option>{/each}</select>
  <button class="secondary" type="submit">Filter</button>
</form>
{#if form?.error}<p class="alert red" role="alert">{form.error}</p>{/if}
{#if form?.scanId}<p class="alert" role="status">Re-scan queued: <a href="/r/{form.scanId}">open report</a></p>{/if}

<div class="panel">
  <div class="table-wrap">
    <table class="wide-table">
      <thead><tr><th>When</th><th>Site</th><th>Status</th><th class="num">Techs</th><th>Took</th><th>From</th><th></th></tr></thead>
      <tbody>
        {#each data.rows as s (s.id)}
          <tr>
            <td class="muted nowrap">{fmtDate(s.createdAt, true)}</td>
            <td><a href="/r/{s.id}">{s.host}</a>{#if s.url.replace(/^https?:\/\//, "").replace(/\/$/, "") !== s.host}<div class="muted small mono">{s.url}</div>{/if}</td>
            <td><span class="pill {statusClass(s.status)}">{s.status}</span>{#if s.error}<div class="small muted">{s.error.slice(0, 80)}</div>{/if}</td>
            <td class="num">{s.techCount}</td>
            <td class="muted nowrap">{fmtMs(s.durationMs)}</td>
            <td class="muted">{s.country ?? '—'}</td>
            <td class="actions">
              <form method="POST" action="?/rescan" use:enhance><input type="hidden" name="url" value={s.url} /><button class="secondary sm" type="submit">Re-scan</button></form>
              <form method="POST" action="?/delete" use:enhance onsubmit={(e) => { if (!confirm('Delete this scan?')) e.preventDefault(); }}><input type="hidden" name="id" value={s.id} /><button class="secondary sm danger" type="submit">Delete</button></form>
            </td>
          </tr>
        {:else}<tr><td colspan="7" class="muted">No scans match.</td></tr>{/each}
      </tbody>
    </table>
  </div>
</div>
{#if data.page > 1 || data.more}
  <div class="pager">
    {#if data.page > 1}<a class="button secondary sm" href="?q={data.q}&status={data.status}&page={data.page - 1}">Newer</a>{/if}
    <span class="muted small">Page {data.page}</span>
    {#if data.more}<a class="button secondary sm" href="?q={data.q}&status={data.status}&page={data.page + 1}">Older</a>{/if}
  </div>
{/if}
