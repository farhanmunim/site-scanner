<script lang="ts">
  import { enhance } from '$app/forms';
  import { fmtDate } from '$lib/format';
  let { data, form } = $props();
</script>

<svelte:head><title>Admin — blocklist</title></svelte:head>
<h1>Blocklist</h1>
<p class="muted small">Domains here (and their subdomains) are refused. Owner opt-outs from the public bot page land here too. Built-in suffix denylist: <code>{data.denySuffixes.join(' ')}</code> (extend via <code>DENYLIST_EXTRA</code>).</p>
<div class="card">
  <form method="POST" action="?/add" class="row" use:enhance>
    <input name="domain" type="text" placeholder="example.com" required style="max-width: 260px" />
    <input name="reason" type="text" placeholder="reason (optional)" style="max-width: 320px" />
    <button class="primary" type="submit">Block</button>
  </form>
  {#if form?.error}<p class="alert bad" style="margin-top: 8px">{form.error}</p>{/if}
</div>
<div class="card table-wrap">
  <table>
    <thead><tr><th>Domain</th><th>Source</th><th>Reason</th><th>Contact</th><th>Added</th><th></th></tr></thead>
    <tbody>
      {#each data.rows as b (b.id)}
        <tr><td class="mono">{b.domain}</td><td><span class="pill neutral">{b.source}</span></td><td class="small">{b.reason ?? ''}</td><td class="small">{b.contact ?? ''}</td><td class="small">{fmtDate(b.createdAt)}</td><td><form method="POST" action="?/remove" use:enhance><input type="hidden" name="id" value={b.id} /><button class="secondary" type="submit">Remove</button></form></td></tr>
      {:else}<tr><td colspan="6" class="muted">Nothing blocked.</td></tr>{/each}
    </tbody>
  </table>
</div>
