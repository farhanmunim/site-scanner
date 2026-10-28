<script lang="ts">
  import type { Report } from '@site-scanner/core/types';
  import Card from './Card.svelte';
  import Ring from './Ring.svelte';
  import { toneFromScore } from './helpers';
  let { report }: { report: Report } = $props();
  let ai = $derived(report.aiReadiness);
  let tone = $derived(toneFromScore(ai?.score));
  const label: Record<string, string> = { good: 'Pass', warn: 'Improve', bad: 'Fail', info: 'Info', unknown: 'Unknown', na: 'N/A' };
  const stone = (s: string) => (s === 'good' ? 'good' : s === 'warn' ? 'warn' : s === 'bad' ? 'bad' : '');
  let blocked = $derived(report.robots?.aiCrawlers.filter((c) => c.blocked) ?? []);
</script>

<Card id="ai" title="AI readiness" desc="Can ChatGPT, Claude and Perplexity find, read and understand this site? Based only on public signals." chip={ai ? `Grade ${ai.grade}` : 'Not assessed'} {tone}>
  {#if ai}
    <div style="display: flex; gap: var(--space-6); align-items: center; flex-wrap: wrap">
      <Ring value={ai.score} {tone} />
      <div class="ss-tiles" style="flex: 1; min-width: 260px">
        <div class="ss-tile"><div class="k">Readable words</div><div class="v">{ai.wordCount.toLocaleString()}</div><div class="t">in the HTML, no JavaScript</div></div>
        <div class="ss-tile {ai.crawlersBlocked ? 'warn' : 'good'}"><div class="k">AI crawlers blocked</div><div class="v">{ai.crawlersBlocked}<small> / {ai.crawlersChecked}</small></div></div>
        <div class="ss-tile {ai.llmsTxt?.present ? 'good' : ''}"><div class="k">llms.txt</div><div class="v" style="font-size: var(--text-lg)">{ai.llmsTxt?.present ? 'Present' : 'Missing'}</div></div>
      </div>
    </div>
    <div>
      {#each ai.items as i (i.id)}
        <div class="ss-checkrow">
          <span class="ss-chip {stone(i.status)}">{label[i.status] ?? i.status}</span>
          <div style="min-width: 0"><div style="font-weight: var(--weight-medium); font-size: var(--text-base)">{i.title}</div><div class="ss-note" style="font-size: var(--text-base)">{i.observed}</div>{#if i.detail}<div class="ss-note">{i.detail}</div>{/if}</div>
          <span class="pts">{i.points} / {i.max}</span>
        </div>
      {/each}
    </div>
    {#if blocked.length}<p class="ss-note">Blocked in robots.txt: {blocked.map((b) => b.agent).join(', ')}.</p>{/if}
  {:else}
    <p class="ss-empty">No page was loaded, so AI readiness could not be assessed.</p>
  {/if}
</Card>
