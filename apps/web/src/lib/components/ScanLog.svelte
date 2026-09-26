<script lang="ts">
  import { STAGE_ORDER, type StageMeta, type StageName } from '@site-scanner/core/types';
  import { TERMINAL } from '$lib/scan-events';
  /** Terminal-style progress log driven by real stage statuses. */
  let { host, stages, status }: { host: string; stages: Partial<Record<StageName, StageMeta>>; status: string } = $props();
  const label: Record<StageName, string> = {
    dns: 'resolving host',
    http: 'fetching page',
    files: 'reading robots, sitemap and scripts',
    rdap: 'looking up domain registration',
    cert: 'inspecting tls certificate',
    browser: 'rendering in a browser',
    external: 'running performance and safety checks'
  };
  let terminal = $derived(TERMINAL.has(status));
  let rows = $derived(
    STAGE_ORDER.map((s) => {
      const st = stages[s]?.status ?? 'pending';
      const pending = st === 'pending';
      const cls = pending ? (terminal ? 'done' : 'cur') : st === 'complete' ? 'done' : st === 'restricted' ? 'done warn' : st === 'failed' ? 'done fail' : 'done';
      const ok = pending ? (terminal ? { t: 'SKIPPED', c: 'skip' } : null) : st === 'complete' ? { t: 'OK', c: '' } : st === 'restricted' ? { t: 'BLOCKED', c: 'warn' } : st === 'failed' ? { t: 'FAILED', c: 'fail' } : { t: 'SKIPPED', c: 'skip' };
      return { s, text: label[s], cls, ok, note: stages[s]?.note ?? null };
    })
  );
  let pct = $derived(terminal ? 100 : Math.round((rows.filter((r) => r.ok).length / STAGE_ORDER.length) * 100));
  export function progress() {
    return pct;
  }
</script>

<div class="log" aria-live="polite">
  <span class="pct">{pct}%</span>
  <div class="cmd"><span class="d"></span>$ site-scan run {host}</div>
  {#each rows as r (r.s)}
    <div class={r.cls} title={r.note ?? undefined}><span class="d"></span>&gt; {r.text}...{#if r.ok}<span class="ok {r.ok.c}">{r.ok.t}</span>{/if}</div>
  {/each}
  {#if terminal}
    <div class="cmd"><span class="d"></span>&gt; {status === 'failed' ? 'scan failed. opening report_' : 'done. opening report_'}<span class="cursor"></span></div>
  {/if}
</div>
<div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}><i style="width: {pct}%"></i></div>
