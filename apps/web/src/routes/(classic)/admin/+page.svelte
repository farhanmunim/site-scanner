<script lang="ts">
  import { ago, fmtMs } from '$lib/format';
  let { data } = $props();
  const statusClass = (s: string) => (s === 'complete' ? 'pass' : s === 'failed' ? 'fail' : s === 'queued' || s === 'running' ? 'info' : 'warn');
</script>

<svelte:head><title>Admin — overview</title></svelte:head>

<div class="page-head">
  <h1>Overview</h1>
  <p class="lead">What the scanner has been doing. Only you can see this.</p>
</div>

<div class="card">
  <div class="card-h"><div><div class="card-title">Activity</div><div class="card-sub">Lookups include cache hits and refusals</div></div></div>
  <div class="stats">
    <div class="stat"><span class="value">{data.stats.lookups24}</span><span class="label">Lookups, 24 h</span></div>
    <div class="stat"><span class="value">{data.stats.lookups7}</span><span class="label">Lookups, 7 days</span></div>
    <div class="stat"><span class="value">{data.stats.scans24}</span><span class="label">Fresh scans, 24 h</span></div>
    <div class="stat"><span class="value">{data.stats.cached24}</span><span class="label">Served from cache, 24 h</span></div>
    <div class="stat"><span class="value {data.stats.failed24 ? 'red' : ''}">{data.stats.failed24}</span><span class="label">Failed, 24 h</span></div>
    <div class="stat"><span class="value">{data.stats.scansAll}</span><span class="label">Scans in total</span></div>
    <div class="stat"><span class="value">{data.stats.queued}</span><span class="label">Waiting in queue</span></div>
    <div class="stat"><span class="value {data.stats.workers ? '' : 'red'}">{data.stats.workers}</span><span class="label">Workers online</span></div>
  </div>
</div>

<div class="admin-grid">
  <div class="card wide">
    <div class="card-h"><div class="card-title">Recent scans</div><a class="small" href="/admin/scans">All scans</a></div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Site</th><th>Status</th><th>When</th><th>Took</th><th>From</th></tr></thead>
        <tbody>
          {#each data.recent as s}
            <tr><td><a href="/r/{s.id}">{s.host}</a></td><td><span class="badge badge-{statusClass(s.status)}">{s.status}</span></td><td class="muted nowrap">{ago(s.createdAt)}</td><td class="muted nowrap">{fmtMs(s.durationMs)}</td><td class="muted">{s.country ?? '—'}</td></tr>
          {:else}<tr><td colspan="5" class="muted">No scans yet.</td></tr>{/each}
        </tbody>
      </table>
    </div>
  </div>
  <div class="stack">
    <div class="card">
      <div class="card-h"><div><div class="card-title">Top technologies</div><div class="card-sub">7 days</div></div></div>
      <table class="table compact rank">
        <tbody>
          {#each data.topTech as t}<tr><td><a href="/admin/technologies?name={encodeURIComponent(t.name)}">{t.name}</a></td><td class="num">{t.n}</td></tr>{:else}<tr><td class="muted">Nothing yet.</td></tr>{/each}
        </tbody>
      </table>
    </div>
    <div class="card">
      <div class="card-h"><div><div class="card-title">Most looked-up</div><div class="card-sub">7 days</div></div></div>
      <table class="table compact rank">
        <tbody>
          {#each data.topDomains as d}<tr><td><a href="/admin/scans?q={encodeURIComponent(d.domain ?? '')}">{d.domain}</a></td><td class="num">{d.n}</td></tr>{:else}<tr><td class="muted">Nothing yet.</td></tr>{/each}
        </tbody>
      </table>
    </div>
  </div>
</div>
