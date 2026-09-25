<script lang="ts">
  import { fmtDate } from '$lib/format';
  let { data } = $props();
</script>

<svelte:head><title>Admin — technologies</title></svelte:head>
<h1>Technologies</h1>
<form class="row" style="margin-bottom: 12px">
  <select name="category" style="max-width: 240px"><option value="">all categories</option>{#each data.categories as c}<option value={c.category ?? ''} selected={data.category === c.category}>{c.category ?? 'Other'} ({c.n})</option>{/each}</select>
  <select name="days" style="max-width: 140px">{#each [7, 30, 90, 365] as d}<option value={d} selected={data.days === d}>last {d} days</option>{/each}</select>
  <button class="secondary" type="submit">Apply</button>
</form>
{#if data.name}
  <div class="card">
    <h2>Sites using {data.name} <span class="muted">({data.sites.length})</span> <a class="small" href="/admin/technologies?category={encodeURIComponent(data.category)}&days={data.days}">clear</a></h2>
    <div class="table-wrap"><table><thead><tr><th>Site</th><th>Version</th><th>Confidence</th><th>Last scan</th></tr></thead><tbody>
      {#each data.sites as s}<tr><td><a href="/r/{s.scanId}">{s.host}</a></td><td>{s.version ?? '—'}</td><td><span class="pill {s.confidence}">{s.confidence}</span></td><td class="small">{fmtDate(s.createdAt, true)}</td></tr>{/each}
    </tbody></table></div>
  </div>
{/if}
<div class="card table-wrap">
  <table>
    <thead><tr><th>Technology</th><th>Category</th><th>Distinct sites</th><th>Detections</th></tr></thead>
    <tbody>{#each data.leaderboard as t}<tr><td><a href="?name={encodeURIComponent(t.name)}&category={encodeURIComponent(data.category)}&days={data.days}">{t.name}</a></td><td class="muted">{t.category ?? '—'}</td><td>{t.sites}</td><td>{t.scansN}</td></tr>{:else}<tr><td colspan="4" class="muted">No detections in this window.</td></tr>{/each}</tbody>
  </table>
</div>
