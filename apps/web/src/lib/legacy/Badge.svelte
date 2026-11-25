<script lang="ts">
  /** Mono status badge: PASS / WARN / FAIL / INFO. Accepts a finding status or a tone. */
  import type { FindingStatus } from '@site-scanner/core/types';
  let { status, label }: { status: FindingStatus | 'pass' | 'warn' | 'fail' | 'neutral' | 'info' | 'green' | 'amber' | 'red' | 'grey'; label?: string } = $props();
  const map: Record<string, { c: string; t: string }> = {
    good: { c: 'pass', t: 'Pass' },
    warn: { c: 'warn', t: 'Warn' },
    bad: { c: 'fail', t: 'Fail' },
    info: { c: 'neutral', t: 'Info' },
    unknown: { c: 'neutral', t: 'Unknown' },
    na: { c: 'neutral', t: 'N/A' },
    pass: { c: 'pass', t: 'Pass' },
    fail: { c: 'fail', t: 'Fail' },
    neutral: { c: 'neutral', t: 'Info' },
    green: { c: 'pass', t: 'Pass' },
    amber: { c: 'warn', t: 'Warn' },
    red: { c: 'fail', t: 'Fail' },
    grey: { c: 'neutral', t: 'Info' }
  };
  let m = $derived(map[status] ?? map.neutral!);
</script>

<span class="badge badge-{m.c}">{label ?? m.t}</span>
