<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { StageMeta, StageName } from '@site-scanner/core/types';
  import { subscribeScan, TERMINAL } from '$lib/scan-events';
  import ScanLog from './ScanLog.svelte';

  let { scanId, host }: { scanId: string; host: string } = $props();
  let status = $state('queued');
  let stages = $state<Partial<Record<StageName, StageMeta>>>({});
  let slow = $state(false);

  onMount(() => {
    document.body.classList.add('modal-open');
    const slowTimer = setTimeout(() => (slow = true), 90_000);
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
      document.body.classList.remove('modal-open');
      clearTimeout(slowTimer);
      if (redirect) clearTimeout(redirect);
      stop();
    };
  });
</script>

<div class="shield">
  <div class="win" role="dialog" aria-modal="true" aria-labelledby="scan-title">
    <h2 id="scan-title">Running scan</h2>
    <div class="target">{host}</div>
    <ScanLog {host} {stages} {status} />
    {#if slow}<p class="escape">Taking longer than usual. <a class="link" href="/r/{scanId}">Open the live report</a> — it fills in as each step finishes.</p>{/if}
  </div>
</div>
