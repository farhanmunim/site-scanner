<script lang="ts">
  import type { Report } from '@site-scanner/core/types';
  import Card from './Card.svelte';
  import type { Tone } from './helpers';
  let { report, running = false }: { report: Report; running?: boolean } = $props();
  let b = $derived(report.blocklists);
  let mail = $derived(b?.listed.filter((h) => h.role === 'mail') ?? []);
  let tone = $derived<Tone>(!b ? '' : mail.length ? 'bad' : b.listed.length ? 'warn' : b.checked.length ? 'good' : 'info');
  let answered = $derived(b ? b.lists.length - b.unavailable.length : 0);
</script>

<Card id="blocklist" title="Blocklists" desc="Mail and web server IPs checked against public DNS blocklists." chip={!b ? (running ? 'Checking…' : 'Unavailable') : b.listed.length ? `${b.listed.length} listing${b.listed.length === 1 ? '' : 's'}` : b.checked.length ? 'Not listed' : 'Nothing to check'} {tone}>
  {#if b}
    {#if b.checked.length}
      <div class="ss-tiles">
        <div class="ss-tile {b.listed.length ? 'bad' : 'good'}"><div class="k">Listings</div><div class="v">{b.listed.length}</div></div>
        <div class="ss-tile"><div class="k">IPs checked</div><div class="v">{b.checked.length}</div><div class="t">{b.checked.filter((c) => c.role === 'mail').length} mail · {b.checked.filter((c) => c.role === 'web').length} web</div></div>
        <div class="ss-tile"><div class="k">Lists answered</div><div class="v">{answered}<small> / {b.lists.length}</small></div></div>
      </div>
      {#if b.listed.length}
        <div class="ss-tbl-wrap"><table class="ss-tbl"><thead><tr><th>IP</th><th>Role</th><th>Blocklist</th><th>Code</th></tr></thead><tbody>{#each b.listed as h}<tr><td class="ss-mono">{h.subject}</td><td>{h.role}</td><td class="ss-mono">{h.list}</td><td class="ss-mono">{h.code}</td></tr>{/each}</tbody></table></div>
        <p class="ss-note">A listed mail server will have mail rejected or sent to spam. Find out why the IP was listed and ask that list for removal.</p>
      {:else}
        <p class="ss-note">None of the {answered} lists that answered include these IPs.</p>
      {/if}
      {#if b.unavailable.length}<p class="ss-note">{b.unavailable.join(', ')} did not answer (some lists refuse queries from large public resolvers). Those are unknown, not clean.</p>{/if}
      <details class="ss-fold"><summary>IPs and lists checked</summary><div class="in"><div class="ss-subs">{#each b.checked as c}<span>{c.ip} · {c.role}</span>{/each}</div><div class="ss-subs" style="margin-top: 8px">{#each b.lists as l}<span class:gone={b.unavailable.includes(l)}>{l}</span>{/each}</div></div></details>
    {:else}
      <p class="ss-empty">There was no IP we could check directly: the web server is behind a CDN and no mail server address was found.</p>
    {/if}
  {:else if running}
    <div class="ss-cardstate"><span class="ss-spin"></span>Checking blocklists…</div>
  {:else}
    <p class="ss-empty">Blocklist checks were not available for this scan.</p>
  {/if}
</Card>
