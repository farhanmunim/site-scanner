<script lang="ts">
  import { enhance } from '$app/forms';
  import { fmtDate } from '$lib/format';
  import Icon from '$lib/ui/Icon.svelte';
  let { data } = $props();
  const now = new Date();
</script>

<svelte:head><title>Admin: domains</title></svelte:head>

<div class="ad-head"><div><span class="eui-eyebrow">Admin</span><h1>Domains</h1><p>One row per registrable domain. A cool-down means the site asked us to back off (403, 429 or a bot challenge).</p></div></div>

<form class="ad-toolbar" role="search">
  <input type="search" name="q" class="eui-input" placeholder="Domain" value={data.q} aria-label="Search domains" />
  <button class="eui-btn outline" type="submit"><Icon name="search" size={14} />Search</button>
</form>

<section class="ad-card">
  <div class="ad-table-wrap">
    <table class="ad-table">
      <thead><tr><th>Domain</th><th class="num">Scans</th><th class="hide-sm">First</th><th class="hide-sm">Last</th><th>Cool-down</th><th></th></tr></thead>
      <tbody>
        {#each data.rows as d (d.registrableDomain)}
          {@const cooling = !!d.cooldownUntil && d.cooldownUntil > now}
          <tr>
            <td>{#if d.latestScanId}<a href="/r/{d.latestScanId}">{d.registrableDomain}</a>{:else}{d.registrableDomain}{/if}</td>
            <td class="num">{d.scanCount}</td>
            <td class="muted nowrap hide-sm">{fmtDate(d.firstScannedAt)}</td>
            <td class="muted nowrap hide-sm">{fmtDate(d.lastScannedAt, true)}</td>
            <td>{#if cooling}<span class="ss-chip warn">until {fmtDate(d.cooldownUntil, true)}</span>{#if d.cooldownReason}&nbsp;<span class="sm muted">{d.cooldownReason}</span>{/if}{:else}<span class="muted">—</span>{/if}</td>
            <td class="acts">{#if cooling}<form method="POST" action="?/clearCooldown" use:enhance><input type="hidden" name="domain" value={d.registrableDomain} /><button class="eui-btn outline sm" type="submit">Clear</button></form>{/if}</td>
          </tr>
        {:else}<tr><td colspan="6" class="empty">No domains yet.</td></tr>{/each}
      </tbody>
    </table>
  </div>
</section>
