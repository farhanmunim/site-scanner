<script lang="ts">
  /** Traffic light: green = fine, amber = worth a look, red = needs fixing, grey = just information. */
  import type { FindingStatus } from '@site-scanner/core/types';
  let { status, label }: { status: FindingStatus | 'green' | 'amber' | 'red' | 'grey'; label?: string } = $props();
  const map: Record<string, { c: string; t: string }> = {
    good: { c: 'green', t: 'Good' },
    warn: { c: 'amber', t: 'Check' },
    bad: { c: 'red', t: 'Fix' },
    info: { c: 'grey', t: 'Info' },
    unknown: { c: 'grey', t: 'Unknown' },
    na: { c: 'grey', t: 'N/A' },
    green: { c: 'green', t: 'Good' },
    amber: { c: 'amber', t: 'Check' },
    red: { c: 'red', t: 'Fix' },
    grey: { c: 'grey', t: 'Info' }
  };
  let m = $derived(map[status] ?? map.grey!);
</script>

<span class="light {m.c}">{label ?? m.t}</span>
