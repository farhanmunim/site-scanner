<script lang="ts">
  import type { Finding } from '@site-scanner/core/types';
  import Light from './Light.svelte';
  import Evidence from './Evidence.svelte';
  let { findings, empty = 'Nothing to show.' }: { findings: Finding[]; empty?: string } = $props();
  // Worst first: fix → check → good → info.
  const order: Record<string, number> = { bad: 0, warn: 1, good: 2, info: 3, unknown: 4, na: 5 };
  let sorted = $derived([...findings].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9)));
</script>

<div class="table-wrap">
  <table>
    <thead><tr><th class="w-status">Status</th><th class="w-label">Check</th><th>What we found</th></tr></thead>
    <tbody>
      {#each sorted as f (f.id)}
        <tr id={f.id}>
          <td class="w-status"><Light status={f.status} /></td>
          <td class="w-label">{f.title}</td>
          <td class="wrap">
            {f.observed}
            {#if f.detail}<div class="muted small" style="margin-top: 3px">{f.detail}</div>{/if}
            {#if f.evidence?.length}<details><summary>Show evidence</summary><Evidence items={f.evidence} /></details>{/if}
          </td>
        </tr>
      {:else}
        <tr><td colspan="3" class="muted">{empty}</td></tr>
      {/each}
    </tbody>
  </table>
</div>
