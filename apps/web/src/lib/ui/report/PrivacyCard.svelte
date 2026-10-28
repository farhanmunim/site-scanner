<script lang="ts">
  import type { Report } from '@site-scanner/core/types';
  import Card from './Card.svelte';
  import Findings from './Findings.svelte';
  import { rollup } from './helpers';
  let { report, open = false, failed = false, note = null }: { report: Report; open?: boolean; failed?: boolean; note?: string | null } = $props();
  let r = $derived(failed ? rollup([], 'Not assessed') : rollup(report.privacy, 'No data'));
</script>

<Card id="privacy" title="Privacy & third parties" desc="Trackers, ad pixels, consent and everything the page loads from other companies.{note ? ` ${note} Not scored.` : ''}" chip={r.label} tone={r.tone}>
  {#if failed}<p class="ss-empty">No page was loaded, so trackers and third-party requests could not be assessed.</p>{:else if report.privacy.length}<Findings findings={report.privacy} {open} />{/if}
  {#if report.thirdParties.length}
    <details class="ss-fold" {open}>
      <summary>{report.thirdParties.length} third-party domain{report.thirdParties.length === 1 ? '' : 's'}</summary>
      <div class="in ss-tbl-wrap"><table class="ss-tbl">
        <thead><tr><th>Service</th><th>Purpose</th><th>Domain</th><th class="num">Requests</th></tr></thead>
        <tbody>{#each report.thirdParties as t (t.domain)}<tr><td>{t.technology ?? `Unknown (${t.domain.split('.').slice(-2).join('.')})`}</td><td class="k">{t.category ?? '—'}</td><td class="ss-mono">{t.domain}</td><td class="num">{t.count}</td></tr>{/each}</tbody>
      </table></div>
    </details>
  {/if}
</Card>
