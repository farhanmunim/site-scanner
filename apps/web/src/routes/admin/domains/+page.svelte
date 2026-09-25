<script lang="ts">
  import { enhance } from '$app/forms';
  import { fmtDate } from '$lib/format';
  let { data } = $props();
</script>

<svelte:head><title>Admin — domains</title></svelte:head>
<h1>Domains</h1>
<form class="row" style="margin-bottom: 12px"><input type="search" name="q" placeholder="domain" value={data.q} style="max-width: 300px" /><button class="secondary" type="submit">Search</button></form>
<div class="card table-wrap">
  <table>
    <thead><tr><th>Domain</th><th>Scans</th><th>First</th><th>Last</th><th>Cool-down</th><th></th></tr></thead>
    <tbody>
      {#each data.rows as d (d.registrableDomain)}
        <tr>
          <td>{#if d.latestScanId}<a href="/r/{d.latestScanId}">{d.registrableDomain}</a>{:else}{d.registrableDomain}{/if}</td>
          <td>{d.scanCount}</td>
          <td class="small">{fmtDate(d.firstScannedAt)}</td>
          <td class="small">{fmtDate(d.lastScannedAt, true)}</td>
          <td class="small">{#if d.cooldownUntil && d.cooldownUntil > new Date()}<span class="pill warn">until {fmtDate(d.cooldownUntil, true)}</span> {d.cooldownReason}{:else}—{/if}</td>
          <td>{#if d.cooldownUntil && d.cooldownUntil > new Date()}<form method="POST" action="?/clearCooldown" use:enhance><input type="hidden" name="domain" value={d.registrableDomain} /><button class="secondary" type="submit">Clear</button></form>{/if}</td>
        </tr>
      {:else}<tr><td colspan="6" class="muted">No domains yet.</td></tr>{/each}
    </tbody>
  </table>
</div>
