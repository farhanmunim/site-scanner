<script lang="ts">
  /**
   * Status marker. Warn/fail states get a tinted badge because they need action; passes and
   * informational states render as a plain status word so a clean report stays quiet.
   * Pass `force` to render a badge for any state (e.g. a score pill).
   */
  import type { FindingStatus } from '@site-scanner/core/types';
  let { status, label, force = false }: { status: FindingStatus | 'pass' | 'warn' | 'fail' | 'neutral' | 'info' | 'green' | 'amber' | 'red' | 'grey'; label?: string; force?: boolean } = $props();
  const map: Record<string, { c: string; t: string; tone: string }> = {
    good: { c: 'pass', t: 'Pass', tone: 'g' },
    warn: { c: 'warn', t: 'Warn', tone: 'a' },
    bad: { c: 'fail', t: 'Fail', tone: 'r' },
    info: { c: 'neutral', t: 'Info', tone: 'n' },
    unknown: { c: 'neutral', t: 'Unknown', tone: 'n' },
    na: { c: 'neutral', t: 'N/A', tone: 'n' },
    pass: { c: 'pass', t: 'Pass', tone: 'g' },
    fail: { c: 'fail', t: 'Fail', tone: 'r' },
    neutral: { c: 'neutral', t: 'Info', tone: 'n' },
    green: { c: 'pass', t: 'Pass', tone: 'g' },
    amber: { c: 'warn', t: 'Warn', tone: 'a' },
    red: { c: 'fail', t: 'Fail', tone: 'r' },
    grey: { c: 'neutral', t: 'Info', tone: 'n' }
  };
  let m = $derived(map[status] ?? map.neutral!);
  let badge = $derived(force || m.c === 'warn' || m.c === 'fail');
</script>

{#if badge}<span class="badge badge-{m.c}">{label ?? m.t}</span>{:else}<span class="st {m.tone}">{label ?? m.t}</span>{/if}
