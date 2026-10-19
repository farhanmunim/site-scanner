<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { STAGE_ORDER, type StageMeta, type StageName } from '@site-scanner/core/types';
  import { subscribeScan, TERMINAL } from '$lib/scan-events';

  let { scanId, host }: { scanId: string; host: string } = $props();
  let status = $state('queued');
  let stages = $state<Partial<Record<StageName, StageMeta>>>({});
  let elapsed = $state(0);
  let terminal = $derived(TERMINAL.has(status));

  const label: Record<StageName, string> = {
    dns: 'Resolving the host',
    http: 'Fetching the page',
    files: 'Reading robots, sitemap and scripts',
    rdap: 'Looking up domain registration',
    cert: 'Inspecting the TLS certificate',
    browser: 'Rendering in a browser',
    external: 'Performance, safety and subdomain checks'
  };
  let rows = $derived(
    STAGE_ORDER.map((s) => {
      const st = stages[s]?.status ?? 'pending';
      const pending = st === 'pending';
      if (pending) return { s, text: label[s], cls: terminal ? 'pend' : 'cur', r: terminal ? 'skipped' : '' };
      if (st === 'complete') return { s, text: label[s], cls: 'done', r: 'ok' };
      if (st === 'restricted') return { s, text: label[s], cls: 'warn', r: 'blocked' };
      if (st === 'failed') return { s, text: label[s], cls: 'fail', r: 'failed' };
      return { s, text: label[s], cls: 'pend', r: 'skipped' };
    })
  );
  let firstPending = $derived(rows.findIndex((r) => r.cls === 'cur'));
  let doneCount = $derived(rows.filter((r) => r.cls !== 'cur' && !(r.cls === 'pend' && !terminal)).length);
  let pct = $derived(terminal ? 100 : Math.round((doneCount / STAGE_ORDER.length) * 100));
  let onlyExternalLeft = $derived(!terminal && rows.every((r) => r.cls !== 'cur' || r.s === 'external'));
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  onMount(() => {
    document.body.style.overflow = 'hidden';
    const started = Date.now();
    const ticker = setInterval(() => (elapsed = Math.round((Date.now() - started) / 1000)), 1000);
    let redirect: ReturnType<typeof setTimeout> | null = null;
    const stop = subscribeScan(
      scanId,
      (u) => {
        status = u.status;
        if (u.stages) stages = u.stages;
        if (TERMINAL.has(u.status) && !redirect) redirect = setTimeout(() => void goto(`/r/${scanId}`), 600);
      },
      { lite: true }
    );
    return () => {
      document.body.style.overflow = '';
      clearInterval(ticker);
      if (redirect) clearTimeout(redirect);
      stop();
    };
  });
</script>

<div class="scrim open">
  <div class="modal scan" role="dialog" aria-modal="true" aria-labelledby="scan-title">
    <h2 id="scan-title">Scanning</h2>
    <div class="host"><span class="tag">{host}</span></div>
    <div class="scan-steps" aria-live="polite">
      {#each rows as r, i (r.s)}
        <div class="s {r.cls}">
          {#if r.cls === 'cur'}
            {#if i === firstPending}<span class="spinner" aria-hidden="true"></span>{:else}<span class="dot n" aria-hidden="true"></span>{/if}
          {:else}
            <span class="dot {r.cls === 'done' ? 'g' : r.cls === 'warn' ? 'o' : r.cls === 'fail' ? 'r' : 'n'}" aria-hidden="true"></span>
          {/if}
          <span class="t">{r.text}</span>
          {#if r.r}<span class="r">{r.r}</span>{/if}
        </div>
      {/each}
    </div>
    <div class="progress-line" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}><i style="width: {pct}%"></i></div>
    <div class="scan-foot"><span>{terminal ? (status === 'failed' ? 'Scan failed · opening report' : 'Done · opening report') : `${clock(elapsed)} · ${pct}%`}</span><span>usually 10–40 s</span></div>
    {#if onlyExternalLeft && elapsed > 12}
      <p class="scan-note">Google PageSpeed can take up to a minute. Everything else is ready.</p>
    {/if}
    {#if elapsed >= 15 && !terminal}
      <div style="margin-top: 16px"><a class="btn outline sm" href="/r/{scanId}">Open the report now</a> <span class="caption" style="margin-left: 8px">It keeps filling in.</span></div>
    {/if}
  </div>
</div>
