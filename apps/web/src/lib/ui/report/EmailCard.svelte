<script lang="ts">
  import type { Report } from '@site-scanner/core/types';
  import Card from './Card.svelte';
  import Findings from './Findings.svelte';
  import { rollup } from './helpers';
  let { report, open = false, note = null }: { report: Report; open?: boolean; note?: string | null } = $props();
  let r = $derived(rollup(report.email, 'No DNS data'));
  let spf = $derived(report.dns?.spf ?? null);
  let dmarc = $derived(report.dns?.dmarc.find((t) => /^v=DMARC1/i.test(t)));
  let policy = $derived(dmarc ? (/\bp=(none|quarantine|reject)/i.exec(dmarc)?.[1]?.toLowerCase() ?? 'none') : null);
  let pol = $derived(policy === 'reject' || policy === 'quarantine' ? 'good' : policy === 'none' ? 'warn' : 'bad');
  let budget = $derived(spf ? (spf.totalLookups > 10 ? 'bad' : spf.totalLookups >= 9 ? 'warn' : 'good') : '');
</script>

<Card id="email" title="Email" desc="Whether others can send email pretending to be this domain, and whether its mail will be accepted.{note ? ` ${note} Not scored.` : ''}" chip={r.label} tone={r.tone}>
  <div class="ss-tiles">
    <div class="ss-tile"><div class="k">Mail provider</div><div class="v" style="font-size: var(--text-lg)">{report.infra.emailProvider?.name ?? (report.dns?.MX.length ? 'Custom' : 'None')}</div><div class="t">{report.dns?.MX.length ?? 0} MX record{(report.dns?.MX.length ?? 0) === 1 ? '' : 's'}</div></div>
    <div class="ss-tile {budget}"><div class="k">SPF lookups</div><div class="v">{spf ? spf.totalLookups : '—'}<small> / 10</small></div><div class="t">{spf ? (spf.allQualifier ? `ends ${spf.allQualifier}all` : 'no all') : 'no SPF record'}</div></div>
    <div class="ss-tile {policy ? pol : 'bad'}"><div class="k">DMARC policy</div><div class="v" style="font-size: var(--text-lg)">{policy ?? 'Missing'}</div><div class="t">{dmarc ? (/\brua=/i.test(dmarc) ? 'reports enabled' : 'no reporting') : ''}</div></div>
    <div class="ss-tile {report.dns?.dkimSelectors.length ? 'good' : ''}"><div class="k">DKIM</div><div class="v" style="font-size: var(--text-lg)">{report.dns?.dkimSelectors.length ? 'Found' : 'Not seen'}</div><div class="t">{report.dns?.dkimSelectors.slice(0, 3).join(', ') || 'common selectors only'}</div></div>
  </div>
  <Findings findings={report.email} {open} empty="DNS could not be read for this domain." />
  {#if report.dns?.MX.length}
    <details class="ss-fold" {open}><summary>{report.dns.MX.length} mail server{report.dns.MX.length === 1 ? '' : 's'}</summary><div class="in ss-tbl-wrap"><table class="ss-tbl"><thead><tr><th>Priority</th><th>Host</th></tr></thead><tbody>{#each report.dns.MX as m}<tr><td class="ss-mono">{m.priority}</td><td class="ss-mono">{m.exchange}</td></tr>{/each}</tbody></table></div></details>
  {/if}
</Card>
