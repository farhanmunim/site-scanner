<script lang="ts">
  import { ago, fmtDate } from '$lib/format';
  let { data } = $props();
</script>

<svelte:head><title>Admin: health</title></svelte:head>

<div class="ad-head"><div><span class="eui-eyebrow">Admin</span><h1>Health</h1><p>Workers, queue, storage and the reputation of the IP address scans leave from.</p></div></div>

<div class="ad-cols even">
  <section class="ad-card">
    <header><div><h2>Workers</h2><p>{data.workers.length} online</p></div><span class="ss-chip {data.workers.length ? 'good' : 'bad'}">{data.workers.length ? 'Running' : 'None'}</span></header>
    {#if data.workers.length}
      <dl class="ad-kv">
        {#each data.workers as w}
          <dt class="ad-mono">{w.id}</dt><dd>{[w.role + (w.browser ? ' + browser' : ''), `v${w.version}`, `${w.memoryMb} MB`, `${w.scansDone} scans`, `seen ${ago(w.lastSeenAt)}`].join(' · ')}{#if w.currentScanId}&nbsp;· <a href="/r/{w.currentScanId}" style="text-decoration: underline">busy</a>{/if}</dd>
        {/each}
      </dl>
    {:else}<p class="ad-note" style="padding: var(--space-4) var(--space-5); color: var(--danger)">No worker heartbeat. Scans will queue but never run.</p>{/if}
  </section>

  <section class="ad-card">
    <header><h2>Queue</h2><span class="ss-chip {data.redis.ok ? 'good' : 'bad'}">{data.redis.ok ? 'Redis connected' : 'Redis unreachable'}</span></header>
    {#if data.redis.ok}
      <dl class="ad-kv">
        {#each Object.entries(data.redis.queue ?? {}) as [k, n]}<dt>{k[0]?.toUpperCase()}{k.slice(1)}</dt><dd>{n}</dd>{/each}
        <dt>Queued or running (database)</dt><dd>{data.queuedScans}</dd>
      </dl>
    {:else}<p class="ad-note" style="padding: var(--space-4) var(--space-5)">Check the Redis service in Coolify.</p>{/if}
  </section>

  <section class="ad-card">
    <header><h2>Egress IP reputation</h2></header>
    <dl class="ad-kv">
      <dt>Scans leave from</dt><dd class="ad-mono">{data.egress ?? 'unknown'}</dd>
      {#if data.egress}
        <dt>Check on</dt><dd><div class="ad-tags">
          <a class="ss-chip" href="https://www.abuseipdb.com/check/{data.egress}" rel="noopener" target="_blank">AbuseIPDB</a>
          <a class="ss-chip" href="https://check.spamhaus.org/results/?query={data.egress}" rel="noopener" target="_blank">Spamhaus</a>
          <a class="ss-chip" href="https://www.virustotal.com/gui/ip-address/{data.egress}" rel="noopener" target="_blank">VirusTotal</a>
          <a class="ss-chip" href="https://talosintelligence.com/reputation_center/lookup?search={data.egress}" rel="noopener" target="_blank">Cisco Talos</a>
        </div></dd>
      {/if}
    </dl>
    <p class="ad-note" style="padding: var(--space-3) var(--space-5) var(--space-4)">Check occasionally. A listing would mean a scanned site reported us; the scanner's rules make that unlikely, and the worker can be moved to another host without touching the rest.</p>
  </section>

  <section class="ad-card">
    <header><div><h2>Storage</h2><p>Database {data.dbSize}</p></div></header>
    <dl class="ad-kv">
      <dt>Oldest raw IP kept</dt><dd>{data.oldestIp ? fmtDate(data.oldestIp, true) : 'None'}</dd>
      {#each data.tables as t}<dt class="ad-mono">{t.table}</dt><dd>{t.rows.toLocaleString()} {t.rows === 1 ? 'row' : 'rows'}</dd>{/each}
    </dl>
  </section>
</div>

<section class="ad-card" style="margin-top: var(--space-5)">
  <header><div><h2>Free API budgets</h2><p>Today (UTC). Over budget means the source is skipped for the rest of the day, never queued.</p></div><span class="ss-chip">{data.globalToday} new scans today</span></header>
  <div class="ad-tbl-wrap"><table class="ad-tbl">
    <thead><tr><th>Service</th><th>Used today</th><th>Our limit</th><th>Skipped</th><th class="hide-sm">Provider allowance</th></tr></thead>
    <tbody>
      {#each data.budgets as b (b.id)}
        {@const pct = b.limit ? Math.round((b.used / b.limit) * 100) : 0}
        <tr><td>{b.label}</td><td><span class="ss-chip {pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : b.used ? 'good' : ''}">{b.used}</span></td><td class="ad-mono">{b.limit}</td><td class="ad-mono">{b.skipped || '—'}</td><td class="hide-sm ad-muted">{b.provider}</td></tr>
      {/each}
    </tbody>
  </table></div>
</section>
