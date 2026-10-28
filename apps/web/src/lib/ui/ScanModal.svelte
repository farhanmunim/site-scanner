<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { type StageMeta, type StageName } from '@site-scanner/core/types';
  import { planFor } from '@site-scanner/core/scope';
  import { subscribeScan, TERMINAL } from '$lib/scan-events';
  import Orb from './Orb.svelte';
  import Icon from './Icon.svelte';

  let { scanId, host, scope = null, after = '' }: { scanId: string; host: string; scope?: string | null; after?: string } = $props();
  // A focused tool only runs some stages; listing the others would show work that never happens.
  const order = planFor(scope).stages;
  let status = $state('queued');
  let stages = $state<Partial<Record<StageName, StageMeta>>>({});
  let elapsed = $state(0);
  let terminal = $derived(TERMINAL.has(status));

  /** Each stage has its own title, icon and orb motion. */
  const STAGE: Record<StageName, { title: string; doing: string; icon: string; orb: string }> = {
    dns: { title: 'DNS & email records', doing: 'Resolving DNS and email records', icon: 'network', orb: 'connecting' },
    http: { title: 'The page', doing: 'Fetching the page', icon: 'globe', orb: 'searching' },
    files: { title: 'Robots, sitemap & scripts', doing: 'Reading robots, sitemap and scripts', icon: 'list', orb: 'weaving' },
    rdap: { title: 'Domain registration', doing: 'Looking up domain registration', icon: 'key', orb: 'working' },
    cert: { title: 'TLS certificate', doing: 'Inspecting the TLS certificate', icon: 'lock', orb: 'solving' },
    browser: { title: 'Browser render', doing: 'Rendering in a browser', icon: 'eye', orb: 'shaping' },
    external: { title: 'Performance, blocklists & more', doing: 'Checking performance, blocklists, vulnerabilities and subdomains', icon: 'bolt', orb: 'composing' }
  };

  let rows = $derived(
    order.map((s) => {
      const st = stages[s]?.status ?? 'pending';
      const ms = stages[s]?.durationMs;
      const t = ms !== undefined ? (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`) : '';
      if (st === 'pending') return { s, cls: terminal ? 'skip' : 'wait', dot: '', meta: terminal ? 'skipped' : 'queued' };
      if (st === 'complete') return { s, cls: 'done', dot: 'g', meta: t || 'ok' };
      if (st === 'restricted') return { s, cls: 'warn', dot: 'o', meta: 'blocked' };
      if (st === 'failed') return { s, cls: 'fail', dot: 'r', meta: 'failed' };
      return { s, cls: 'skip', dot: '', meta: 'skipped' };
    })
  );
  let current = $derived(rows.findIndex((r) => r.cls === 'wait' && !terminal));
  let doneCount = $derived(rows.filter((r) => r.cls !== 'wait').length);
  let pct = $derived(terminal ? 100 : Math.max(4, Math.round((doneCount / order.length) * 100)));
  let active = $derived(current >= 0 ? STAGE[rows[current]!.s] : null);
  let orbState = $derived(terminal ? 'breathing' : (active?.orb ?? 'working'));
  let onlyExternalLeft = $derived(!terminal && current >= 0 && rows[current]!.s === 'external');
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
        if (TERMINAL.has(u.status) && !redirect) redirect = setTimeout(() => void goto(`/r/${scanId}${after}`), 700);
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
    <div class="ss-mhead">
      <span class="ss-pill"><i></i>{terminal ? (status === 'failed' ? 'Failed' : 'Done') : 'Scanning'}</span>
      <span class="ss-mclock">{clock(elapsed)}</span>
    </div>
    <div class="ss-mstage">
      <Orb motion={orbState} size={120} />
      <h2 id="scan-title">{host}</h2>
      <p class="ss-mnow" aria-live="polite">{terminal ? (status === 'failed' ? 'The scan failed. Opening what we have…' : 'Done. Opening the report…') : (active?.doing ?? 'Working…')}</p>
    </div>
    <div class="ss-mlist">
      {#each rows as r, i (r.s)}
        <div class="ss-mrow {r.cls}" class:cur={i === current}>
          <span class="ico">{#if i === current}<span class="ss-spin" aria-hidden="true"></span>{:else if r.cls === 'done'}<Icon name="check" size={14} />{:else if r.cls === 'warn' || r.cls === 'fail'}<Icon name="alert" size={14} />{:else}<Icon name={STAGE[r.s].icon} size={14} />{/if}</span>
          <span class="t">{STAGE[r.s].title}</span>
          <span class="m">{#if r.dot}<i class="dt {r.dot}"></i>{/if}{i === current ? 'running' : r.meta}</span>
        </div>
      {/each}
    </div>
    <div class="ss-mfoot">
      <div class="ss-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}><i style="width: {pct}%"></i></div>
      <div class="ss-foot-line"><span>{pct}%</span><span>{onlyExternalLeft && elapsed > 12 ? 'Google PageSpeed can take up to a minute' : 'usually 10–40 s'}</span></div>
      {#if elapsed >= 15 && !terminal}<div class="ss-row" style="margin-top: 12px"><a class="eui-btn outline sm" href="/r/{scanId}{after}">Open the report now</a><span class="ss-note">It keeps filling in.</span></div>{/if}
    </div>
  </div>
</div>
