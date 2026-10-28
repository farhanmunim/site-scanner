<script lang="ts">
  import type { Report } from '@site-scanner/core/types';
  import { CWV_THRESHOLDS, vitals } from '@site-scanner/core/analyze/score';
  import { fmtBytes } from '$lib/format';
  import Card from './Card.svelte';
  let { report, open = false, running = false }: { report: Report; open?: boolean; running?: boolean } = $props();
  const METRIC = { lcpMs: { n: 'LCP', t: 'Largest Contentful Paint' }, cls: { n: 'CLS', t: 'Cumulative Layout Shift' }, inpMs: { n: 'INP', t: 'Interaction to Next Paint' }, tbtMs: { n: 'TBT', t: 'Total Blocking Time (lab proxy for INP)' }, ttfbMs: { n: 'TTFB', t: 'Time to First Byte' } } as const;
  const fmt = (m: keyof typeof CWV_THRESHOLDS, v: number) => (m === 'cls' ? v.toFixed(2) : v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`);
  const target = (m: keyof typeof CWV_THRESHOLDS) => (m === 'cls' ? CWV_THRESHOLDS[m][0].toFixed(2) : CWV_THRESHOLDS[m][0] >= 1000 ? `${(CWV_THRESHOLDS[m][0] / 1000).toFixed(2)}s` : `${CWV_THRESHOLDS[m][0]}ms`);
  const verdict = { good: { c: 'good', t: 'Good' }, 'needs-work': { c: 'warn', t: 'Needs work' }, poor: { c: 'bad', t: 'Poor' } } as const;
  const pct = (m: keyof typeof CWV_THRESHOLDS, v: number) => Math.max(6, Math.min(100, Math.round((v / (CWV_THRESHOLDS[m][1] * 1.25)) * 100)));
  const lhTone = (n: number | null) => (n === null ? '' : n >= 90 ? 'good' : n >= 50 ? 'warn' : 'bad');
  let p = $derived(report.performance);
  let rows = $derived(p ? vitals(p) : []);
  let needs = $derived(rows.filter((v) => v.verdict !== 'good').length);
</script>

<Card id="performance" title="Performance" desc="Google PageSpeed Insights, mobile profile, with real-user Chrome data where available." chip={p ? (needs ? `${needs} of ${rows.length} need work` : 'All good') : 'Not measured'} tone={p ? (needs ? 'warn' : 'good') : ''}>
  {#if p}
    <div class="ss-vitals">
      {#each rows as v (v.metric)}
        <div class="ss-vital" title={METRIC[v.metric].t}>
          <div class="n"><span>{METRIC[v.metric].n}</span><span class="ss-chip {verdict[v.verdict].c}">{verdict[v.verdict].t}</span></div>
          <div class="big">{fmt(v.metric, v.value)}</div>
          <div class="ss-bar"><i class={verdict[v.verdict].c} style="width: {pct(v.metric, v.value)}%"></i></div>
          <div class="t">Target &lt; {target(v.metric)} · {v.source === 'field' ? 'real users' : 'lab'}</div>
        </div>
      {/each}
    </div>
    <div class="ss-tiles">
      {#each [['Performance', p.scores.performance], ['Accessibility', p.scores.accessibility], ['Best practices', p.scores.bestPractices], ['SEO', p.scores.seo]] as [label, n]}
        <div class="ss-tile {lhTone(n as number | null)}"><div class="k">{label}</div><div class="v">{n ?? '—'}<small> / 100</small></div></div>
      {/each}
    </div>
    {#if p.totalBytes}
      <div class="ss-pay">
        <span>Wire payload <b>{fmtBytes(p.totalBytes)}</b>{#if p.requestCount} across <b>{p.requestCount}</b> requests{/if}</span>
        {#if p.breakdown}{@const b = p.breakdown}<span>JS <b>{fmtBytes(b.scriptBytes)}</b></span><span>Images <b>{fmtBytes(b.imageBytes)}</b></span><span>Fonts <b>{fmtBytes(b.fontBytes)}</b></span><span>CSS <b>{fmtBytes(b.stylesheetBytes)}</b></span>{#if b.thirdPartyBytes !== null}<span>Third-party <b>{fmtBytes(b.thirdPartyBytes)}</b></span>{/if}{/if}
      </div>
    {/if}
    {#if p.accessibilityIssues.length}
      <details class="ss-fold" {open}>
        <summary>{p.accessibilityIssues.length} accessibility issue{p.accessibilityIssues.length === 1 ? '' : 's'} flagged by Lighthouse</summary>
        <div class="in ss-find">
          {#each p.accessibilityIssues.slice(0, 8) as a (a.id)}
            <div class="ss-frow" style="grid-template-columns: 64px minmax(0, 1fr)"><span><span class="ss-chip warn">A11y</span></span><div class="nm">{a.title}<span class="cd">{a.count} element{a.count === 1 ? '' : 's'}</span></div></div>
          {/each}
          <p class="ss-note" style="margin-top: 8px">Automated checks find only part of the accessibility picture.</p>
        </div>
      </details>
    {/if}
  {:else}
    <p class="ss-empty">{running ? 'Waiting for Google PageSpeed Insights…' : 'Performance data is not available for this scan. It needs a Google API key on the server and a page that loaded.'}</p>
  {/if}
</Card>
