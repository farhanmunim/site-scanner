<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { StageMeta, StageName } from '@site-scanner/core/types';
  import { subscribeScan, TERMINAL } from '$lib/scan-events';
  import ScanLog from './ScanLog.svelte';

  let { scanId, host, base = '' }: { scanId: string; host: string; base?: string } = $props();
  let status = $state('queued');
  let stages = $state<Partial<Record<StageName, StageMeta>>>({});
  let elapsed = $state(0);
  let showOpen = $derived(elapsed >= 15);

  onMount(() => {
    document.body.classList.add('modal-open');
    const started = Date.now();
    const ticker = setInterval(() => (elapsed = Math.round((Date.now() - started) / 1000)), 1000);
    let redirect: ReturnType<typeof setTimeout> | null = null;
    const stop = subscribeScan(
      scanId,
      (u) => {
        status = u.status;
        if (u.stages) stages = u.stages;
        if (TERMINAL.has(u.status) && !redirect) redirect = setTimeout(() => void goto(`${base}/r/${scanId}`), 600);
      },
      { lite: true }
    );
    return () => {
      document.body.classList.remove('modal-open');
      clearInterval(ticker);
      if (redirect) clearTimeout(redirect);
      stop();
    };
  });
</script>

<div class="shield">
  <div class="win" role="dialog" aria-modal="true" aria-labelledby="scan-title">
    <h2 id="scan-title">Running scan</h2>
    <div class="target">{host}</div>
    <ScanLog {host} {stages} {status} {elapsed} />
    {#if showOpen}
      <div class="escape">
        <a class="btn btn-outline" href="{base}/r/{scanId}">Open the report now</a>
        <span>It keeps filling in as the last checks finish.</span>
      </div>
    {/if}
  </div>
</div>
