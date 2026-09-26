<script lang="ts">
  import type { Snippet } from 'svelte';
  /**
   * One report section. A section's size follows how many problems it has: sections with
   * warnings open, all-clear ones collapse to a single row (title · status · score).
   * Hash links into a collapsed section open it (see reveal() on the report page).
   */
  let {
    id,
    title,
    sub = '',
    open = false,
    status = '',
    tone = 'n',
    score = null,
    allowBreak = false,
    children
  }: {
    id: string;
    title: string;
    sub?: string;
    open?: boolean;
    status?: string;
    tone?: 'g' | 'a' | 'r' | 'n';
    score?: number | null;
    allowBreak?: boolean;
    children: Snippet;
  } = $props();
</script>

<details class="sec" {id} {open}>
  <summary>
    <div class="sec-h">
      <span class="chev" aria-hidden="true"></span>
      <div style="min-width: 0">
        <h2>{title}</h2>
        {#if sub}<p class="sec-sub">{sub}</p>{/if}
      </div>
    </div>
    <div class="sec-meta">
      {#if status}<span class="st {tone}">{status}</span>{/if}
      {#if score !== null}<span class="sec-score">{score}<small>/100</small></span>{/if}
    </div>
  </summary>
  <div class="sec-body" class:allow-break={allowBreak}>{@render children()}</div>
</details>
