<script lang="ts">
  import type { Finding } from '@site-scanner/core/types';
  /**
   * Findings as rows: status · check · observed value and explanation.
   * Items needing attention stay visible; passed and informational rows fold away.
   */
  let { findings, codes = {}, values = {}, empty = 'Nothing to show.', open = false }: { findings: Finding[]; codes?: Record<string, string>; values?: Record<string, string | null | undefined>; empty?: string; open?: boolean } = $props();
  const order: Record<string, number> = { bad: 0, warn: 1, good: 2, info: 3, unknown: 4, na: 5 };
  const rank = (x: Finding) => (x.relevance === 'low' ? 6 : (order[x.status] ?? 9));
  const MISSING = /\b(not observed|not set|not found|not present|no [a-z-]+ record|none seen|missing)\b/i;
  const label: Record<string, string> = { good: 'Pass', warn: 'Warn', bad: 'Fail', info: 'Info', unknown: 'Unknown', na: 'N/A' };
  let sorted = $derived([...findings].sort((a, b) => rank(a) - rank(b)));
  let attention = $derived(sorted.filter((f) => (f.status === 'bad' || f.status === 'warn') && f.relevance !== 'low'));
  let rest = $derived(sorted.filter((f) => !attention.includes(f)));
  let passed = $derived(rest.filter((f) => f.status === 'good').length);
  let summary = $derived(passed && passed === rest.length ? `${passed} check${passed === 1 ? '' : 's'} passed` : passed ? `${passed} passed, ${rest.length - passed} for information` : `${rest.length} for information`);
  const headerEvidence = (f: Finding) => f.evidence?.find((e) => e.source === 'header' && e.value)?.value ?? null;
  function value(f: Finding): { chip: string | null; miss: boolean; text: string | null } {
    const v = values[f.id];
    if (v) return { chip: v, miss: false, text: null };
    const h = headerEvidence(f);
    if (h) return { chip: h.length > 160 ? h.slice(0, 157) + '…' : h, miss: false, text: null };
    if ((f.id in values || f.id in codes) && MISSING.test(f.observed)) return { chip: 'not set', miss: true, text: null };
    return { chip: null, miss: false, text: f.observed };
  }
  const tone = (f: Finding) => (f.relevance === 'low' ? '' : f.status === 'good' ? 'good' : f.status === 'warn' ? 'warn' : f.status === 'bad' ? 'bad' : f.status === 'info' ? 'info' : '');
</script>

{#snippet rows(list: Finding[])}
  <div class="ss-find">
    {#each list as f (f.id)}
      {@const v = value(f)}
      <div class="ss-frow" id={f.id}>
        <span><span class="ss-chip {tone(f)}">{f.relevance === 'low' ? 'Low' : (label[f.status] ?? f.status)}</span></span>
        <div class="nm">{f.title}{#if codes[f.id]}<span class="cd">{codes[f.id]}</span>{/if}</div>
        <div class="ob">
          {#if v.chip !== null}<span class="v" class:miss={v.miss}>{v.chip}</span>{/if}
          {#if v.text}<p>{v.text}</p>{:else if f.observed && v.chip !== null && f.observed !== v.chip}<p>{f.observed}</p>{/if}
          {#if f.detail}<p class="det">{f.detail}</p>{/if}
        </div>
      </div>
    {/each}
  </div>
{/snippet}

{#if !sorted.length}
  <p class="ss-empty">{empty}</p>
{:else}
  {#if attention.length}{@render rows(attention)}{/if}
  {#if rest.length}
    {#if attention.length}
      <details class="ss-more" {open}><summary>{summary}</summary><div class="in">{@render rows(rest)}</div></details>
    {:else}
      {@render rows(rest)}
    {/if}
  {/if}
{/if}
