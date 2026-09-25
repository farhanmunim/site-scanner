<script lang="ts">
  import { enhance } from '$app/forms';
  import { fmtDate, fmtMs } from '$lib/format';
  let { data, form } = $props();
</script>

<svelte:head><title>Admin — scans</title></svelte:head>
<h1>Scans</h1>
<form class="row" style="margin-bottom: 12px">
  <input type="search" name="q" placeholder="host" value={data.q} style="max-width: 260px" />
  <select name="status" style="max-width: 160px"><option value="">any status</option>{#each ['complete', 'partial', 'restricted', 'failed', 'queued', 'running'] as s}<option value={s} selected={data.status === s}>{s}</option>{/each}</select>
  <button class="secondary" type="submit">Filter</button>
</form>
{#if form?.error}<p class="alert bad">{form.error}</p>{/if}
{#if form?.scanId}<p class="alert">Re-scan queued: <a href="/r/{form.scanId}">open report</a></p>{/if}
<div class="card table-wrap">
  <table>
    <thead><tr><th>When</th><th>Site</th><th>Status</th><th>Techs</th><th>Took</th><th>From</th><th></th></tr></thead>
    <tbody>
      {#each data.rows as s (s.id)}
        <tr>
          <td class="small">{fmtDate(s.createdAt, true)}</td>
          <td><a href="/r/{s.id}">{s.host}</a><div class="muted small mono">{s.url}</div></td>
          <td><span class="pill {s.status === 'complete' ? 'good' : s.status === 'failed' ? 'bad' : 'warn'}">{s.status}</span>{#if s.error}<div class="small muted">{s.error.slice(0, 80)}</div>{/if}</td>
          <td>{s.techCount}</td>
          <td>{fmtMs(s.durationMs)}</td>
          <td>{s.country ?? '—'}</td>
          <td class="row" style="flex-wrap: nowrap">
            <form method="POST" action="?/rescan" use:enhance><input type="hidden" name="url" value={s.url} /><button class="secondary" type="submit" title="Fresh scan, bypassing cache">Re-scan</button></form>
            <form method="POST" action="?/delete" use:enhance onsubmit={(e) => { if (!confirm('Delete this scan?')) e.preventDefault(); }}><input type="hidden" name="id" value={s.id} /><button class="secondary" type="submit">Delete</button></form>
          </td>
        </tr>
      {:else}<tr><td colspan="7" class="muted">No scans.</td></tr>{/each}
    </tbody>
  </table>
</div>
<div class="row" style="margin-top: 10px">{#if data.page > 1}<a class="button secondary" href="?q={data.q}&status={data.status}&page={data.page - 1}">Newer</a>{/if}{#if data.more}<a class="button secondary" href="?q={data.q}&status={data.status}&page={data.page + 1}">Older</a>{/if}</div>
