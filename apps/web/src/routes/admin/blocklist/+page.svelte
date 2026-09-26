<script lang="ts">
  import { enhance } from '$app/forms';
  import { fmtDate } from '$lib/format';
  let { data, form } = $props();
</script>

<svelte:head><title>Admin — blocklist</title></svelte:head>

<div class="page-head">
  <h1>Blocklist</h1>
  <p class="lead">Domains listed here, and their subdomains, are refused. Opt-outs from the public bot page land here too.</p>
</div>

<div class="panel">
  <header><h2>Block a domain</h2></header>
  <form method="POST" action="?/add" class="toolbar in-panel" use:enhance>
    <input name="domain" type="text" placeholder="example.com" required aria-label="Domain" />
    <input name="reason" type="text" placeholder="Reason (optional)" aria-label="Reason" />
    <button class="primary" type="submit">Block</button>
  </form>
  {#if form?.error}<p class="alert red in-panel-alert" role="alert">{form.error}</p>{/if}
  <p class="note">Always refused, regardless of this list: <code>{data.denySuffixes.join(' ')}</code>. Extend with the <code>DENYLIST_EXTRA</code> environment variable.</p>
</div>

<div class="panel">
  <header><h2>Blocked domains ({data.rows.length})</h2></header>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Domain</th><th>Source</th><th>Reason</th><th>Contact</th><th>Added</th><th></th></tr></thead>
      <tbody>
        {#each data.rows as b (b.id)}
          <tr><td class="mono">{b.domain}</td><td><span class="pill">{b.source}</span></td><td class="small muted">{b.reason ?? ''}</td><td class="small muted">{b.contact ?? ''}</td><td class="muted nowrap">{fmtDate(b.createdAt)}</td><td class="actions"><form method="POST" action="?/remove" use:enhance><input type="hidden" name="id" value={b.id} /><button class="secondary sm" type="submit">Remove</button></form></td></tr>
        {:else}<tr><td colspan="6" class="muted">Nothing blocked.</td></tr>{/each}
      </tbody>
    </table>
  </div>
</div>
