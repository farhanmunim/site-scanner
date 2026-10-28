<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { STAGE_ORDER, type StageMeta, type StageName } from '@site-scanner/core/types';
  import { subscribeScan, TERMINAL } from '$lib/scan-events';

  let { scanId, host, after = '' }: { scanId: string; host: string; after?: string } = $props();
  let status = $state('queued');
  let stages = $state<Partial<Record<StageName, StageMeta>>>({});
  let elapsed = $state(0);
  let terminal = $derived(TERMINAL.has(status));

  const label: Record<StageName, string> = {
    dns: 'Resolving DNS and email records',
    http: 'Fetching the page',
    files: 'Reading robots, sitemap and scripts',
    rdap: 'Looking up domain registration',
    cert: 'Inspecting the TLS certificate',
    browser: 'Rendering in a browser',
    external: 'Performance, blocklists, vulnerabilities, subdomains'
  };
  let rows = $derived(
    STAGE_ORDER.map((s) => {
      const st = stages[s]?.status ?? 'pending';
      if (st === 'pending') return { s, cls: terminal ? 'pend' : 'cur', dot: '', r: terminal ? 'skipped' : '' };
      if (st === 'complete') return { s, cls: 'done', dot: 'g', r: 'ok' };
      if (st === 'restricted') return { s, cls: 'warn', dot: 'o', r: 'blocked' };
      if (st === 'failed') return { s, cls: 'fail', dot: 'r', r: 'failed' };
      return { s, cls: 'pend', dot: '', r: 'skipped' };
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
        if (TERMINAL.has(u.status) && !redirect) redirect = setTimeout(() => void goto(`/r/${scanId}${after}`), 600);
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

<div class="ss-scrim">
  <div class="ss-modal" role="dialog" aria-modal="true" aria-labelledby="scan-title">
    <span class="eui-eyebrow">Scanning</span>
    <h2 id="scan-title">{host}</h2>
    <div class="ss-steps-list" aria-live="polite">
      {#each rows as r, i (r.s)}
        <div class="s {r.cls}">
          {#if r.cls === 'cur' && i === firstPending}<span class="ss-spin" aria-hidden="true"></span>{:else}<span class="dt {r.dot}" aria-hidden="true"></span>{/if}
          <span>{label[r.s]}</span>
          {#if r.r}<span class="r">{r.r}</span>{/if}
        </div>
      {/each}
    </div>
    <div class="ss-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}><i style="width: {pct}%"></i></div>
    <div class="ss-foot-line"><span>{terminal ? (status === 'failed' ? 'Scan failed · opening report' : 'Done · opening report') : `${clock(elapsed)} · ${pct}%`}</span><span>usually 10–40 s</span></div>
    {#if onlyExternalLeft && elapsed > 12}<p class="ss-note" style="margin-top: 12px">Google PageSpeed can take up to a minute. Everything else is ready.</p>{/if}
    {#if elapsed >= 15 && !terminal}<div class="ss-row" style="margin-top: 16px"><a class="eui-btn outline sm" href="/r/{scanId}{after}">Open the report now</a><span class="ss-note">It keeps filling in.</span></div>{/if}
  </div>
</div>
