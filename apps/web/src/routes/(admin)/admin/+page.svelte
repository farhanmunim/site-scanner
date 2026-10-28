<script lang="ts">
  import { ago, fmtMs } from '$lib/format';
  let { data } = $props();
  const tone = (s: string) => (s === 'complete' ? 'good' : s === 'failed' ? 'bad' : s === 'queued' || s === 'running' ? 'info' : 'warn');
  const maxTech = $derived(Math.max(1, ...data.topTech.map((t: { n: number }) => t.n)));
  const maxDom = $derived(Math.max(1, ...data.topDomains.map((d: { n: number }) => d.n)));
</script>

<svelte:head><title>Admin: overview</title></svelte:head>

<div class="ad-head"><div><span class="eui-eyebrow">Admin</span><h1>Overview</h1><p>What the scanner has been doing. Only you can see this.</p></div></div>

<div class="ad-stack">
  <section class="ad-card">
    <header><div><h2>Activity</h2><p>Lookups include cache hits and refusals</p></div></header>
    <div class="ad-kpis">
      <div class="ad-kpi"><div class="v">{data.stats.lookups24}</div><div class="k">Lookups, 24 h</div></div>
      <div class="ad-kpi"><div class="v">{data.stats.lookups7}</div><div class="k">Lookups, 7 days</div></div>
      <div class="ad-kpi"><div class="v">{data.stats.scans24}</div><div class="k">Fresh scans, 24 h</div></div>
      <div class="ad-kpi"><div class="v">{data.stats.cached24}</div><div class="k">From cache, 24 h</div></div>
      <div class="ad-kpi" class:bad={data.stats.failed24 > 0}><div class="v">{data.stats.failed24}</div><div class="k">Failed, 24 h</div></div>
      <div class="ad-kpi"><div class="v">{data.stats.scansAll}</div><div class="k">Scans in total</div></div>
      <div class="ad-kpi" class:warn={data.stats.queued > 5}><div class="v">{data.stats.queued}</div><div class="k">Waiting in queue</div></div>
      <div class="ad-kpi" class:bad={!data.stats.workers} class:good={data.stats.workers > 0}><div class="v">{data.stats.workers}</div><div class="k">Workers online</div></div>
    </div>
  </section>

  <div class="ad-cols">
    <section class="ad-card">
      <header><h2>Recent scans</h2><a class="ad-link" href="/admin/scans">All scans →</a></header>
      <div class="ad-table-wrap">
        <table class="ad-table">
          <thead><tr><th>Site</th><th class="hide-sm">Status</th><th>When</th><th class="hide-sm">Took</th><th class="hide-sm">From</th></tr></thead>
          <tbody>
            {#each data.recent as s}
              <tr><td><a href="/r/{s.id}">{s.host}</a><div class="show-sm"><span class="ss-chip {tone(s.status)}">{s.status}</span></div></td><td class="hide-sm"><span class="ss-chip {tone(s.status)}">{s.status}</span></td><td class="muted nowrap">{ago(s.createdAt)}</td><td class="muted nowrap hide-sm">{fmtMs(s.durationMs)}</td><td class="muted hide-sm">{s.country ?? '—'}</td></tr>
            {:else}<tr><td colspan="5" class="empty">No scans yet.</td></tr>{/each}
          </tbody>
        </table>
      </div>
    </section>
    <div class="ad-stack">
      <section class="ad-card">
        <header><div><h2>Top technologies</h2><p>Last 7 days</p></div><a class="ad-link" href="/admin/technologies">All →</a></header>
        <ul class="ad-rank">
          {#each data.topTech as t}<li><a href="/admin/technologies?name={encodeURIComponent(t.name)}">{t.name}</a><b>{t.n}</b><i style="--w: {(t.n / maxTech) * 100}%"></i></li>{:else}<li class="empty">Nothing yet.</li>{/each}
        </ul>
      </section>
      <section class="ad-card">
        <header><div><h2>Most looked-up</h2><p>Last 7 days</p></div></header>
        <ul class="ad-rank">
          {#each data.topDomains as d}<li><a href="/admin/scans?q={encodeURIComponent(d.domain ?? '')}">{d.domain}</a><b>{d.n}</b><i style="--w: {(d.n / maxDom) * 100}%"></i></li>{:else}<li class="empty">Nothing yet.</li>{/each}
        </ul>
      </section>
    </div>
  </div>
</div>
