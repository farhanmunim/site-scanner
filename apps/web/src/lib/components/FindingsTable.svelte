<script lang="ts">
  import type { Finding } from '@site-scanner/core/types';
  import Badge from './Badge.svelte';
  /**
   * Findings as rows: status · name · observed value. "Why it matters" is a per-row
   * disclosure. `codes` maps a finding id to a literal label (a header name) shown in mono;
   * `values` supplies a mono value chip per id. Rows needing attention stay visible; passed
   * and informational rows fold into a dropdown unless `collapsePassed` is false or a filter
   * is active. Under 640px the table stacks (see .hdrs in app.css).
   */
  let { findings, codes = {}, values = {}, empty = 'Nothing to show.', filter = '', collapsePassed = true, open = false }: { findings: Finding[]; codes?: Record<string, string>; values?: Record<string, string | null | undefined>; empty?: string; filter?: string; collapsePassed?: boolean; open?: boolean } = $props();
  const order: Record<string, number> = { bad: 0, warn: 1, good: 2, info: 3, unknown: 4, na: 5 };
  const rank = (x: Finding) => (x.relevance === 'low' ? 6 : (order[x.status] ?? 9));
  const MISSING = /\b(not observed|not set|not found|not present|no [a-z-]+ record|none seen|missing)\b/i;
  let sorted = $derived([...findings].sort((a, b) => rank(a) - rank(b)));
  let shown = $derived(filter ? sorted.filter((f) => `${f.id} ${f.title} ${codes[f.id] ?? ''} ${f.observed} ${f.detail ?? ''}`.toLowerCase().includes(filter.toLowerCase())) : sorted);
  let folding = $derived(collapsePassed && !filter);
  let attention = $derived(folding ? shown.filter((f) => (f.status === 'bad' || f.status === 'warn') && f.relevance !== 'low') : shown);
  let rest = $derived(folding ? shown.filter((f) => !attention.includes(f)) : []);
  let passed = $derived(rest.filter((f) => f.status === 'good').length);
  let summary = $derived(passed && passed === rest.length ? `${passed} check${passed === 1 ? '' : 's'} passed` : passed ? `${passed} passed, ${rest.length - passed} for information` : `${rest.length} for information`);
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

{#snippet rows(list: Finding[])}
  <div class="table-wrap">
    <table class="table hdrs">
      <thead><tr><th>Status</th><th>Check</th><th>Observed value</th></tr></thead>
      <tbody>
        {#each list as f (f.id)}
          {@const v = value(f)}
          <tr id={f.id}>
            <td><Badge status={f.status} label={f.relevance === 'low' ? 'Low impact' : undefined} /></td>
            <td class="code-cell"><span class="m-badge"><Badge status={f.status} label={f.relevance === 'low' ? 'Low impact' : undefined} /></span><h3>{codes[f.id] ?? f.title}</h3>{#if codes[f.id]}<span class="sub">{f.title}</span>{/if}</td>
            <td>
              {#if v.chip !== null}<span class="val" class:miss={v.miss}>{v.chip}</span>{/if}
              {#if v.text}<div class:insight={v.chip !== null}>{v.text}</div>{/if}
              {#if v.chip !== null && !v.text && f.observed && f.observed !== v.chip && !v.miss}<div class="insight">{f.observed}</div>{/if}
              {#if v.miss && f.observed}<div class="insight">{f.observed}</div>{/if}
              {#if f.detail}<details class="why" {open}><summary>Why it matters</summary><p>{f.detail}</p></details>{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/snippet}

{#if !shown.length}
  <p class="note">{filter ? 'Nothing matches that filter.' : empty}</p>
{:else}
  {#if attention.length}{@render rows(attention)}{/if}
  {#if rest.length}
    <details class="show-all" {open}>
      <summary>{attention.length ? summary : `All clear: ${summary}`}</summary>
      {@render rows(rest)}
    </details>
  {/if}
{/if}
