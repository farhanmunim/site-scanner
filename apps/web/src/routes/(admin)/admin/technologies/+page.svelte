<script lang="ts">
  import { fmtDate } from '$lib/format';
  let { data } = $props();
  const conf = { high: 'good', medium: 'warn', low: '' } as const;
  const confWord = { high: 'Certain', medium: 'Likely', low: 'Possible' } as const;
</script>

<svelte:head><title>Admin: technologies</title></svelte:head>

<div class="ad-head"><div><span class="eui-eyebrow">Admin</span><h1>Technologies</h1><p>What the scanned sites are built with. Select a technology to list the sites using it.</p></div></div>

<form class="ad-toolbar">
  <select name="category" class="eui-input" aria-label="Category"><option value="">All categories</option>{#each data.categories as c}<option value={c.category ?? ''} selected={data.category === c.category}>{c.category ?? 'Other'} ({c.n})</option>{/each}</select>
  <select name="days" class="eui-input" aria-label="Period">{#each [7, 30, 90, 365] as d}<option value={d} selected={data.days === d}>Last {d} days</option>{/each}</select>
  <button class="eui-btn outline" type="submit">Apply</button>
</form>

<div class="ad-stack">
  {#if data.name}
    <section class="ad-card">
      <header><h2>Sites using {data.name} ({data.sites.length})</h2><a class="ad-link" href="/admin/technologies?category={encodeURIComponent(data.category)}&days={data.days}">Clear</a></header>
      <div class="ad-table-wrap">
        <table class="ad-table">
          <thead><tr><th>Site</th><th>Version</th><th>Confidence</th><th>Last scan</th></tr></thead>
          <tbody>{#each data.sites as s}<tr><td><a href="/r/{s.scanId}">{s.host}</a></td><td class="mono">{s.version ?? '—'}</td><td><span class="ss-chip {conf[s.confidence as keyof typeof conf] ?? ''}">{confWord[s.confidence as keyof typeof confWord] ?? s.confidence}</span></td><td class="muted nowrap">{fmtDate(s.createdAt, true)}</td></tr>{/each}</tbody>
        </table>
      </div>
    </section>
  {/if}
  <section class="ad-card">
    <header><div><h2>Leaderboard</h2><p>Distinct sites in the selected period</p></div></header>
    <div class="ad-table-wrap">
      <table class="ad-table">
        <thead><tr><th>Technology</th><th class="hide-sm">Category</th><th class="num">Sites</th><th class="num hide-sm">Detections</th></tr></thead>
        <tbody>{#each data.leaderboard as t}<tr><td><a href="?name={encodeURIComponent(t.name)}&category={encodeURIComponent(data.category)}&days={data.days}">{t.name}</a></td><td class="muted hide-sm">{t.category ?? '—'}</td><td class="num">{t.sites}</td><td class="num hide-sm">{t.scansN}</td></tr>{:else}<tr><td colspan="4" class="empty">No detections in this period.</td></tr>{/each}</tbody>
      </table>
    </div>
  </section>
</div>
