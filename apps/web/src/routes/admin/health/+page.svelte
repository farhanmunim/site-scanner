<script lang="ts">
  import { ago, fmtDate } from '$lib/format';
  let { data } = $props();
</script>

<svelte:head><title>Admin — health</title></svelte:head>
<h1>Health</h1>
<div class="grid">
  <div class="card">
    <h2>Workers</h2>
    {#each data.workers as w}
      <dl class="kv">
        <dt>{w.id}</dt><dd>{w.role}{w.browser ? ' + browser' : ''} · v{w.version} · {w.memoryMb} MB · {w.scansDone} scans · seen {ago(w.lastSeenAt)}{#if w.currentScanId} · <a href="/r/{w.currentScanId}">busy</a>{/if}</dd>
      </dl>
    {:else}<p class="alert red">No worker heartbeat. Scans will queue but never run.</p>{/each}
  </div>
  <div class="card">
    <h2>Queue &amp; Redis</h2>
    {#if data.redis.ok}
      <dl class="kv"><dt>Redis</dt><dd><span class="pill green">connected</span></dd>{#each Object.entries(data.redis.queue ?? {}) as [k, v]}<dt>{k}</dt><dd>{v}</dd>{/each}<dt>DB queued/running</dt><dd>{data.queuedScans}</dd></dl>
    {:else}<p class="alert red">Redis unreachable.</p>{/if}
  </div>
  <div class="card">
    <h2>Egress IP reputation</h2>
    <p>Outbound scans leave from <strong class="mono">{data.egress ?? 'unknown'}</strong>.</p>
    {#if data.egress}
      <ul class="small">
        <li><a href="https://www.abuseipdb.com/check/{data.egress}" rel="noopener" target="_blank">AbuseIPDB</a></li>
        <li><a href="https://check.spamhaus.org/results/?query={data.egress}" rel="noopener" target="_blank">Spamhaus</a></li>
        <li><a href="https://www.virustotal.com/gui/ip-address/{data.egress}" rel="noopener" target="_blank">VirusTotal</a></li>
        <li><a href="https://talosintelligence.com/reputation_center/lookup?search={data.egress}" rel="noopener" target="_blank">Cisco Talos</a></li>
      </ul>
      <p class="small muted">Check these occasionally. A listing would mean a target reported us; the scanner's rules make that unlikely, and if it happens the scanner container can be moved to another host without touching the rest.</p>
    {/if}
  </div>
  <div class="card">
    <h2>Storage</h2>
    <dl class="kv"><dt>Database size</dt><dd>{data.dbSize}</dd><dt>Oldest raw IP kept</dt><dd>{data.oldestIp ? fmtDate(data.oldestIp, true) : 'none'}</dd></dl>
    <div class="table-wrap"><table><thead><tr><th>Table</th><th>Rows</th></tr></thead><tbody>{#each data.tables as t}<tr><td class="mono small">{t.table}</td><td>{t.rows}</td></tr>{/each}</tbody></table></div>
  </div>
</div>
