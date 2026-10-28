<script lang="ts">
  import type { Report, SpfNode } from '@site-scanner/core/types';
  import Card from './Card.svelte';
  import type { Tone } from './helpers';
  let { report }: { report: Report } = $props();
  let spf = $derived(report.dns?.spf ?? null);
  let tone = $derived<Tone>(!spf ? '' : spf.totalLookups > 10 || spf.recordCount > 1 ? 'bad' : spf.totalLookups >= 9 || spf.voidLookups > 2 || spf.hasPtr ? 'warn' : 'good');
  let pct = $derived(spf ? Math.min(100, Math.round((spf.totalLookups / 10) * 100)) : 0);
  const q: Record<string, string> = { '-': 'Reject (-all)', '~': 'Soft fail (~all)', '?': 'Neutral (?all)', '+': 'Allow everyone (+all)' };
</script>

{#snippet node(n: SpfNode)}
  <li>
    <div class="nd">
      <span class="dm">{n.domain}</span>
      <span class="via">{n.via}</span>
      {#if n.lookups}<span class="ss-chip">{n.lookups} lookup{n.lookups === 1 ? '' : 's'}</span>{/if}
      {#if n.error}<span class="err">{n.error}</span>{/if}
    </div>
    {#if n.record}<div class="rec">{n.record}</div>{/if}
    {#if n.children.length}<ul>{#each n.children as c}{@render node(c)}{/each}</ul>{/if}
  </li>
{/snippet}

<Card id="spf" title="SPF inspector" desc="The SPF record followed through every include, the way a receiving mail server reads it." chip={spf ? (spf.totalLookups > 10 ? 'Over the limit' : `${spf.totalLookups} / 10 lookups`) : 'No SPF record'} {tone}>
  {#if spf}
    <div class="ss-spf">
      <div class="ss-meter">
        <div class="row"><span>DNS lookups used</span><b>{spf.totalLookups} <span class="ss-muted" style="font-size: var(--text-base); font-weight: 400">of 10 allowed</span></b></div>
        <div class="ss-bar"><i class={tone} style="width: {pct}%"></i></div>
        <p class="ss-note">Receivers stop at 10 lookups and treat the record as broken (permerror), so SPF fails for every message.{spf.truncated ? ' The walk stopped at its depth limit, so the real total may be higher.' : ''}</p>
      </div>
      <div class="ss-tiles">
        <div class="ss-tile"><div class="k">Ends with</div><div class="v" style="font-size: var(--text-base)">{spf.allQualifier ? q[spf.allQualifier] : 'No all'}</div></div>
        <div class="ss-tile {spf.voidLookups > 2 ? 'warn' : ''}"><div class="k">Void lookups</div><div class="v">{spf.voidLookups}<small> / 2</small></div></div>
        <div class="ss-tile"><div class="k">IP ranges</div><div class="v">{spf.ip4Count + spf.ip6Count}</div><div class="t">{spf.ip4Count} IPv4 · {spf.ip6Count} IPv6</div></div>
        <div class="ss-tile {spf.recordCount > 1 ? 'bad' : ''}"><div class="k">Records</div><div class="v">{spf.recordCount}</div><div class="t">{spf.recordCount > 1 ? 'only one is allowed' : 'at the domain root'}</div></div>
      </div>
      <div><div class="sub-h">Include tree</div><ul class="ss-tree">{@render node(spf.tree)}</ul></div>
      {#if spf.errors.length}<div><div class="sub-h">Problems</div><ul class="ss-note" style="padding-left: 18px; display: grid; gap: 4px">{#each spf.errors as e}<li>{e}</li>{/each}</ul></div>{/if}
    </div>
  {:else}
    <p class="ss-empty">{report.dns ? 'No SPF record was found at the domain root. Without SPF, receivers cannot tell which servers may send mail for this domain.' : 'DNS could not be read for this domain.'}</p>
  {/if}
</Card>
