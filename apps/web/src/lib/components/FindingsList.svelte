<script lang="ts">
  import type { Finding } from '@site-scanner/core/types';
  import Badge from './Badge.svelte';
  /**
   * Findings as a vertical list. Rows needing attention (fail/warn) are always visible;
   * passed and informational rows fold into a "N checks passed" dropdown so a clean
   * section is two lines tall. Print mode opens every <details> on the page.
   */
  let { findings, open = false, empty = 'Nothing to show.' }: { findings: Finding[]; open?: boolean; empty?: string } = $props();
  const order: Record<string, number> = { bad: 0, warn: 1, good: 2, info: 3, unknown: 4, na: 5 };
  const rank = (x: Finding) => (x.relevance === 'low' ? 6 : (order[x.status] ?? 9));
  let sorted = $derived([...findings].sort((a, b) => rank(a) - rank(b)));
  let attention = $derived(sorted.filter((f) => (f.status === 'bad' || f.status === 'warn') && f.relevance !== 'low'));
  let rest = $derived(sorted.filter((f) => !attention.includes(f)));
  let passed = $derived(rest.filter((f) => f.status === 'good').length);
  let summary = $derived(passed && passed === rest.length ? `${passed} check${passed === 1 ? '' : 's'} passed` : passed ? `${passed} passed, ${rest.length - passed} for information` : `${rest.length} for information`);
</script>

{#if !findings.length}
  <p class="note">{empty}</p>
{:else}
  {#if attention.length}
    <div class="findings">
      {#each attention as f (f.id)}
        <div class="finding" id={f.id}><Badge status={f.status} /><div><b>{f.title}</b><p>{f.observed}</p>{#if f.detail}<p class="muted">{f.detail}</p>{/if}</div></div>
      {/each}
    </div>
  {/if}
  {#if rest.length}
    <details class="show-all" {open}>
      <summary>{attention.length ? summary : `All clear: ${summary}`}</summary>
      <div class="findings">
        {#each rest as f (f.id)}
          <div class="finding" id={f.id}><Badge status={f.status} label={f.relevance === 'low' ? 'Low impact' : undefined} /><div><b>{f.title}</b><p>{f.observed}</p>{#if f.detail}<p class="muted">{f.detail}</p>{/if}</div></div>
        {/each}
      </div>
    </details>
  {/if}
{/if}
