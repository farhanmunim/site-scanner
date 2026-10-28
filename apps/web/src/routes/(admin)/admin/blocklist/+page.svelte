<script lang="ts">
  import { enhance } from '$app/forms';
  import { fmtDate } from '$lib/format';
  import Icon from '$lib/ui/Icon.svelte';
  let { data, form } = $props();
</script>

<svelte:head><title>Admin: blocklist</title></svelte:head>

<div class="ad-head"><div><span class="eui-eyebrow">Admin</span><h1>Blocklist</h1><p>Domains listed here, and their subdomains, are refused. Add emailed opt-outs here.</p></div></div>

<div class="ad-stack">
  <section class="ad-card">
    <header><h2>Block a domain</h2></header>
    <form method="POST" action="?/add" class="ad-toolbar in" use:enhance>
      <input name="domain" type="text" class="eui-input" placeholder="example.com" required aria-label="Domain" />
      <input name="reason" type="text" class="eui-input" placeholder="Reason (optional)" aria-label="Reason" />
      <button class="eui-btn" type="submit"><Icon name="plus" size={14} />Block</button>
    </form>
    {#if form?.error}<div class="ss-alert err ad-alert" role="alert"><Icon name="alert" /><div>{form.error}</div></div>{/if}
    <p class="ad-note pad" style="padding: var(--space-3) var(--space-5) var(--space-4)">Always refused, regardless of this list: <code>{data.denySuffixes.join(' ')}</code>. Extend with the <code>DENYLIST_EXTRA</code> environment variable.</p>
  </section>

  <section class="ad-card">
    <header><h2>Blocked domains ({data.rows.length})</h2></header>
    <div class="ad-table-wrap">
      <table class="ad-table">
        <thead><tr><th>Domain</th><th class="hide-sm">Source</th><th>Reason</th><th class="hide-sm">Contact</th><th class="hide-sm">Added</th><th></th></tr></thead>
        <tbody>
          {#each data.rows as b (b.id)}
            <tr><td class="mono">{b.domain}</td><td class="hide-sm"><span class="ss-chip">{b.source}</span></td><td class="sm muted">{b.reason ?? ''}</td><td class="sm muted hide-sm">{b.contact ?? ''}</td><td class="muted nowrap hide-sm">{fmtDate(b.createdAt)}</td><td class="acts"><form method="POST" action="?/remove" use:enhance><input type="hidden" name="id" value={b.id} /><button class="eui-btn outline sm" type="submit">Remove</button></form></td></tr>
          {:else}<tr><td colspan="6" class="empty">Nothing blocked.</td></tr>{/each}
        </tbody>
      </table>
    </div>
  </section>
</div>
