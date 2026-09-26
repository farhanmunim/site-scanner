<script lang="ts">
  import { ago, fmtDate } from '$lib/format';
  let { data } = $props();
</script>

<svelte:head><title>Admin — health</title></svelte:head>

<div class="page-head">
  <h1>Health</h1>
  <p class="lead">Workers, queue, storage and the reputation of the IP address scans leave from.</p>
</div>

<div class="admin-grid even">
  <div class="panel">
    <header><h2>Workers</h2><span class="hint">{data.workers.length} online</span></header>
    {#if data.workers.length}
      <table class="kv"><tbody>
        {#each data.workers as w}
          <tr><td class="mono">{w.id}</td><td>{[w.role + (w.browser ? ' + browser' : ''), `v${w.version}`, `${w.memoryMb} MB`, `${w.scansDone} scans`, `seen ${ago(w.lastSeenAt)}`].join(' · ')}{#if w.currentScanId}&nbsp;· <a href="/r/{w.currentScanId}">busy</a>{/if}</td></tr>
        {/each}
      </tbody></table>
    {:else}<p class="note red">No worker heartbeat. Scans will queue but never run.</p>{/if}
  </div>

  <div class="panel">
    <header><h2>Queue</h2><span class="light {data.redis.ok ? 'green' : 'red'}">{data.redis.ok ? 'Redis connected' : 'Redis unreachable'}</span></header>
    {#if data.redis.ok}
      <table class="kv"><tbody>
        {#each Object.entries(data.redis.queue ?? {}) as [k, n]}<tr><td>{k[0]?.toUpperCase()}{k.slice(1)}</td><td>{n}</td></tr>{/each}
        <tr><td>Queued or running (database)</td><td>{data.queuedScans}</td></tr>
      </tbody></table>
    {:else}<p class="note">Check the Redis service in Coolify.</p>{/if}
  </div>

  <div class="panel">
    <header><h2>Egress IP reputation</h2></header>
    <table class="kv"><tbody>
      <tr><td>Scans leave from</td><td class="mono">{data.egress ?? 'unknown'}</td></tr>
      {#if data.egress}
        <tr><td>Check on</td><td class="chips">
          <a class="pill" href="https://www.abuseipdb.com/check/{data.egress}" rel="noopener" target="_blank">AbuseIPDB</a>
          <a class="pill" href="https://check.spamhaus.org/results/?query={data.egress}" rel="noopener" target="_blank">Spamhaus</a>
          <a class="pill" href="https://www.virustotal.com/gui/ip-address/{data.egress}" rel="noopener" target="_blank">VirusTotal</a>
          <a class="pill" href="https://talosintelligence.com/reputation_center/lookup?search={data.egress}" rel="noopener" target="_blank">Cisco Talos</a>
        </td></tr>
      {/if}
    </tbody></table>
    <p class="note">Check occasionally. A listing would mean a scanned site reported us; the scanner's rules make that unlikely, and the worker can be moved to another host without touching the rest.</p>
  </div>

  <div class="panel">
    <header><h2>Storage</h2><span class="hint">Database {data.dbSize}</span></header>
    <table class="kv"><tbody>
      <tr><td>Oldest raw IP kept</td><td>{data.oldestIp ? fmtDate(data.oldestIp, true) : 'None'}</td></tr>
      {#each data.tables as t}<tr><td class="mono">{t.table}</td><td>{t.rows.toLocaleString()} rows</td></tr>{/each}
    </tbody></table>
  </div>
</div>
