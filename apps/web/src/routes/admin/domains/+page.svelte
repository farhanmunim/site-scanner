<script lang="ts">
  import { enhance } from '$app/forms';
  import { fmtDate } from '$lib/format';
  let { data } = $props();
  const now = new Date();
</script>

<svelte:head><title>Admin — domains</title></svelte:head>

<div class="page-head">
  <h1>Domains</h1>
  <p class="lead">One row per registrable domain. A cool-down means the site asked us to back off (403, 429 or a bot challenge).</p>
</div>

<form class="toolbar" role="search">
  <input type="search" name="q" placeholder="Domain" value={data.q} aria-label="Search domains" />
  <button class="secondary" type="submit">Search</button>
</form>

<div class="panel">
  <div class="table-wrap">
    <table>
      <thead><tr><th>Domain</th><th class="num">Scans</th><th>First</th><th>Last</th><th>Cool-down</th><th></th></tr></thead>
      <tbody>
        {#each data.rows as d (d.registrableDomain)}
          {@const cooling = !!d.cooldownUntil && d.cooldownUntil > now}
          <tr>
            <td>{#if d.latestScanId}<a href="/r/{d.latestScanId}">{d.registrableDomain}</a>{:else}{d.registrableDomain}{/if}</td>
            <td class="num">{d.scanCount}</td>
            <td class="muted nowrap">{fmtDate(d.firstScannedAt)}</td>
            <td class="muted nowrap">{fmtDate(d.lastScannedAt, true)}</td>
            <td>{#if cooling}<span class="pill amber">until {fmtDate(d.cooldownUntil, true)}</span>{#if d.cooldownReason}&nbsp;<span class="small muted">{d.cooldownReason}</span>{/if}{:else}<span class="muted">—</span>{/if}</td>
            <td class="actions">{#if cooling}<form method="POST" action="?/clearCooldown" use:enhance><input type="hidden" name="domain" value={d.registrableDomain} /><button class="secondary sm" type="submit">Clear</button></form>{/if}</td>
          </tr>
        {:else}<tr><td colspan="6" class="muted">No domains yet.</td></tr>{/each}
      </tbody>
    </table>
  </div>
</div>
