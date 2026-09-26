<script lang="ts">
  import { fmtDate } from '$lib/format';
  let { data } = $props();
  const conf = { high: 'green', medium: 'amber', low: 'grey' } as const;
  const confWord = { high: 'Certain', medium: 'Likely', low: 'Possible' } as const;
</script>

<svelte:head><title>Admin — technologies</title></svelte:head>

<div class="page-head">
  <h1>Technologies</h1>
  <p class="lead">What the scanned sites are built with. Click a technology to list the sites using it.</p>
</div>

<form class="toolbar">
  <select name="category" aria-label="Category"><option value="">All categories</option>{#each data.categories as c}<option value={c.category ?? ''} selected={data.category === c.category}>{c.category ?? 'Other'} ({c.n})</option>{/each}</select>
  <select name="days" aria-label="Period">{#each [7, 30, 90, 365] as d}<option value={d} selected={data.days === d}>Last {d} days</option>{/each}</select>
  <button class="secondary" type="submit">Apply</button>
</form>

{#if data.name}
  <div class="panel">
    <header><h2>Sites using {data.name} ({data.sites.length})</h2><a class="small" href="/admin/technologies?category={encodeURIComponent(data.category)}&days={data.days}">Clear</a></header>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Site</th><th>Version</th><th>Confidence</th><th>Last scan</th></tr></thead>
        <tbody>
          {#each data.sites as s}<tr><td><a href="/r/{s.scanId}">{s.host}</a></td><td>{s.version ?? '—'}</td><td><span class="light {conf[s.confidence as keyof typeof conf] ?? 'grey'}">{confWord[s.confidence as keyof typeof confWord] ?? s.confidence}</span></td><td class="muted nowrap">{fmtDate(s.createdAt, true)}</td></tr>{/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}

<div class="panel">
  <header><h2>Leaderboard</h2><span class="hint">Distinct sites in the selected period</span></header>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Technology</th><th>Category</th><th class="num">Sites</th><th class="num">Detections</th></tr></thead>
      <tbody>{#each data.leaderboard as t}<tr><td><a href="?name={encodeURIComponent(t.name)}&category={encodeURIComponent(data.category)}&days={data.days}">{t.name}</a></td><td class="muted">{t.category ?? '—'}</td><td class="num">{t.sites}</td><td class="num">{t.scansN}</td></tr>{:else}<tr><td colspan="4" class="muted">No detections in this period.</td></tr>{/each}</tbody>
    </table>
  </div>
</div>
