<script lang="ts">
  import type { Finding } from '@site-scanner/core/types';
  import Badge from './Badge.svelte';
  /**
   * Findings as a "defence matrix": badge · name · observed value + insight.
   * `codes` maps a finding id to a mono label (e.g. a header name); `values` supplies a
   * mono value chip per id. Without either, the observed text is shown as prose.
   */
  let { findings, codes = {}, values = {}, empty = 'Nothing to show.', filter = '' }: { findings: Finding[]; codes?: Record<string, string>; values?: Record<string, string | null | undefined>; empty?: string; filter?: string } = $props();
  const order: Record<string, number> = { bad: 0, warn: 1, good: 2, info: 3, unknown: 4, na: 5 };
  const MISSING = /\b(not observed|not set|not found|not present|no [a-z-]+ record|none seen|missing)\b/i;
  let sorted = $derived([...findings].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9)));
  let shown = $derived(filter ? sorted.filter((f) => `${f.id} ${f.title} ${codes[f.id] ?? ''} ${f.observed} ${f.detail ?? ''}`.toLowerCase().includes(filter.toLowerCase())) : sorted);
  const headerEvidence = (f: Finding) => f.evidence?.find((e) => e.source === 'header' && e.value)?.value ?? null;
  function value(f: Finding): { chip: string | null; miss: boolean; text: string | null } {
    const v = values[f.id];
    if (v) return { chip: v, miss: false, text: null };
    const h = headerEvidence(f);
    if (h) return { chip: h.length > 160 ? h.slice(0, 157) + '…' : h, miss: false, text: null };
    if (f.id in values || f.id in codes) {
      if (MISSING.test(f.observed)) return { chip: 'not set', miss: true, text: null };
    }
    return { chip: null, miss: false, text: f.observed };
  }
</script>

<div class="table-wrap">
  <table class="table hdrs">
    <thead><tr><th>Status</th><th>Check</th><th>Observed value &amp; insight</th></tr></thead>
    <tbody>
      {#each shown as f (f.id)}
        {@const v = value(f)}
        <tr id={f.id}>
          <td><Badge status={f.status} /></td>
          <td class="code-cell"><span class="m-badge"><Badge status={f.status} /></span>{codes[f.id] ?? f.title}{#if codes[f.id]}<span class="sub">{f.title}</span>{/if}</td>
          <td>
            {#if v.chip !== null}<span class="val" class:miss={v.miss}>{v.chip}</span>{/if}
            {#if v.text}<div class:insight={v.chip !== null}>{v.text}</div>{/if}
            {#if v.chip !== null && !v.text && f.observed && f.observed !== v.chip && !v.miss}<div class="insight">{f.observed}</div>{/if}
            {#if v.miss && f.observed}<div class="insight">{f.observed}</div>{/if}
            {#if f.detail}<div class="insight">{f.detail}</div>{/if}
          </td>
        </tr>
      {:else}
        <tr><td colspan="3" class="muted">{filter ? 'Nothing matches that filter.' : empty}</td></tr>
      {/each}
    </tbody>
  </table>
</div>
