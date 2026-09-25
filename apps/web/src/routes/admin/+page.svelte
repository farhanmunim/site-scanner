<script lang="ts">
  import { ago, fmtMs } from '$lib/format';
  let { data } = $props();
</script>

<svelte:head><title>Admin — overview</title></svelte:head>
<h1>Overview</h1>
<div class="card">
  <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(130px, 1fr))">
    <div class="stat"><span class="value">{data.stats.lookups24}</span><span class="label">lookups, 24h</span></div>
    <div class="stat"><span class="value">{data.stats.lookups7}</span><span class="label">lookups, 7d</span></div>
    <div class="stat"><span class="value">{data.stats.scans24}</span><span class="label">fresh scans, 24h</span></div>
    <div class="stat"><span class="value">{data.stats.cached24}</span><span class="label">served from cache, 24h</span></div>
    <div class="stat"><span class="value">{data.stats.failed24}</span><span class="label">failed, 24h</span></div>
    <div class="stat"><span class="value">{data.stats.scansAll}</span><span class="label">scans total</span></div>
    <div class="stat"><span class="value">{data.stats.queued}</span><span class="label">in queue</span></div>
    <div class="stat"><span class="value {data.stats.workers ? '' : 'pill bad'}">{data.stats.workers}</span><span class="label">workers online</span></div>
  </div>
</div>
<div class="grid" style="margin-top: 14px">
  <div class="card" style="grid-column: span 2">
    <h2>Recent scans</h2>
    <div class="table-wrap"><table><thead><tr><th>Site</th><th>Status</th><th>When</th><th>Took</th><th>From</th></tr></thead><tbody>
      {#each data.recent as s}<tr><td><a href="/r/{s.id}">{s.host}</a></td><td><span class="pill {s.status === 'complete' ? 'good' : s.status === 'failed' ? 'bad' : 'warn'}">{s.status}</span></td><td>{ago(s.createdAt)}</td><td>{fmtMs(s.durationMs)}</td><td>{s.country ?? '—'}</td></tr>{/each}
    </tbody></table></div>
  </div>
  <div class="card">
    <h2>Top technologies, 7d</h2>
    <ul class="small" style="padding-left: 18px">{#each data.topTech as t}<li><a href="/admin/technologies?name={encodeURIComponent(t.name)}">{t.name}</a> <span class="muted">{t.n}</span></li>{/each}</ul>
    <h2 style="margin-top: 14px">Most looked-up, 7d</h2>
    <ul class="small" style="padding-left: 18px">{#each data.topDomains as d}<li><a href="/admin/scans?q={encodeURIComponent(d.domain ?? '')}">{d.domain}</a> <span class="muted">{d.n}</span></li>{/each}</ul>
  </div>
</div>
