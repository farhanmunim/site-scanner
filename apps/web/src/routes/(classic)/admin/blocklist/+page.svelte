<script lang="ts">
  import { enhance } from '$app/forms';
  import { fmtDate } from '$lib/format';
  let { data, form } = $props();
</script>

<svelte:head><title>Admin — blocklist</title></svelte:head>

<div class="page-head">
  <h1>Blocklist</h1>
  <p class="lead">Domains listed here, and their subdomains, are refused. Add emailed opt-outs here.</p>
</div>

<div class="card">
  <div class="card-h"><div class="card-title">Block a domain</div></div>
  <form method="POST" action="?/add" class="toolbar in-card" use:enhance>
    <input name="domain" type="text" class="input" placeholder="example.com" required aria-label="Domain" />
    <input name="reason" type="text" class="input" placeholder="Reason (optional)" aria-label="Reason" />
    <button class="btn btn-primary" type="submit">Block</button>
  </form>
  {#if form?.error}<p class="alert alert-fail in-card-alert" role="alert">{form.error}</p>{/if}
  <p class="note">Always refused, regardless of this list: <code>{data.denySuffixes.join(' ')}</code>. Extend with the <code>DENYLIST_EXTRA</code> environment variable.</p>
</div>

<div class="card">
  <div class="card-h"><div class="card-title">Blocked domains ({data.rows.length})</div></div>
  <div class="table-wrap">
    <table class="table">
      <thead><tr><th>Domain</th><th>Source</th><th>Reason</th><th>Contact</th><th>Added</th><th></th></tr></thead>
      <tbody>
        {#each data.rows as b (b.id)}
          <tr><td class="mono">{b.domain}</td><td><span class="tag">{b.source}</span></td><td class="small muted">{b.reason ?? ''}</td><td class="small muted">{b.contact ?? ''}</td><td class="muted nowrap">{fmtDate(b.createdAt)}</td><td class="actions"><form method="POST" action="?/remove" use:enhance><input type="hidden" name="id" value={b.id} /><button class="btn btn-outline btn-sm" type="submit">Remove</button></form></td></tr>
        {:else}<tr><td colspan="6" class="muted">Nothing blocked.</td></tr>{/each}
      </tbody>
    </table>
  </div>
</div>
