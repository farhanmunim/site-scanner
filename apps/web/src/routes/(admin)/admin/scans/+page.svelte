<script lang="ts">
  import { enhance } from '$app/forms';
  import { fmtDate, fmtMs } from '$lib/format';
  import Icon from '$lib/ui/Icon.svelte';
  let { data, form } = $props();
  const tone = (s: string) => (s === 'complete' ? 'good' : s === 'failed' ? 'bad' : s === 'queued' || s === 'running' ? 'info' : 'warn');
</script>

<svelte:head><title>Admin: scans</title></svelte:head>

<div class="ad-head"><div><span class="eui-eyebrow">Admin</span><h1>Scans</h1><p>Every stored report. Re-scan runs a fresh scan and bypasses the cache.</p></div></div>

<form class="ad-toolbar">
  <input type="search" name="q" class="eui-input" placeholder="Host" value={data.q} aria-label="Filter by host" />
  <select name="status" class="eui-input" aria-label="Status"><option value="">Any status</option>{#each ['complete', 'partial', 'restricted', 'failed', 'queued', 'running'] as s}<option value={s} selected={data.status === s}>{s}</option>{/each}</select>
  <button class="eui-btn outline" type="submit">Filter</button>
</form>
{#if form?.error}<div class="ss-alert err ad-alert" role="alert"><Icon name="alert" /><div>{form.error}</div></div>{/if}
{#if form?.scanId}<div class="ss-alert ok ad-alert" role="status"><Icon name="check" /><div>Re-scan queued: <a href="/r/{form.scanId}" style="text-decoration: underline">open report</a></div></div>{/if}

<section class="ad-card">
  <div class="ad-table-wrap">
    <table class="ad-table">
      <thead><tr><th class="hide-sm">When</th><th>Site</th><th class="hide-sm">Status</th><th class="num hide-sm">Techs</th><th class="hide-sm">Took</th><th class="hide-sm">From</th><th></th></tr></thead>
      <tbody>
        {#each data.rows as s (s.id)}
          <tr>
            <td class="muted nowrap hide-sm">{fmtDate(s.createdAt, true)}</td>
            <td><a href="/r/{s.id}">{s.host}</a>{#if s.url.replace(/^https?:\/\//, '').replace(/\/$/, '') !== s.host}<div class="muted sm mono">{s.url}</div>{/if}<div class="show-sm"><span class="ss-chip {tone(s.status)}">{s.status}</span></div></td>
            <td class="hide-sm"><span class="ss-chip {tone(s.status)}">{s.status}</span>{#if s.error}<div class="sm muted">{s.error.slice(0, 80)}</div>{/if}</td>
            <td class="num hide-sm">{s.techCount}</td>
            <td class="muted nowrap hide-sm">{fmtMs(s.durationMs)}</td>
            <td class="muted hide-sm">{s.country ?? '—'}</td>
            <td class="acts">
              <form method="POST" action="?/rescan" use:enhance><input type="hidden" name="url" value={s.url} /><button class="eui-btn outline sm" type="submit" aria-label="Re-scan"><Icon name="refresh" size={13} /><span class="lbl">Re-scan</span></button></form>
              <form method="POST" action="?/delete" use:enhance onsubmit={(e) => { if (!confirm('Delete this scan?')) e.preventDefault(); }}><input type="hidden" name="id" value={s.id} /><button class="eui-btn outline sm danger" type="submit" aria-label="Delete scan"><Icon name="trash" size={13} /></button></form>
            </td>
          </tr>
        {:else}<tr><td colspan="7" class="empty">No scans match.</td></tr>{/each}
      </tbody>
    </table>
  </div>
</section>
{#if data.page > 1 || data.more}
  <div class="ad-pager">
    {#if data.page > 1}<a class="eui-btn outline sm" href="?q={encodeURIComponent(data.q)}&status={encodeURIComponent(data.status)}&page={data.page - 1}">Newer</a>{/if}
    <span>Page {data.page}</span>
    {#if data.more}<a class="eui-btn outline sm" href="?q={encodeURIComponent(data.q)}&status={encodeURIComponent(data.status)}&page={data.page + 1}">Older</a>{/if}
  </div>
{/if}
