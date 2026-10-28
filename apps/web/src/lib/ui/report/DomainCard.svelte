<script lang="ts">
  import type { Report } from '@site-scanner/core/types';
  import { daysUntil, fmtDate } from '$lib/format';
  import Card from './Card.svelte';
  import Findings from './Findings.svelte';
  import { rollup, dot } from './helpers';
  let { report, open = false }: { report: Report; open?: boolean } = $props();
  let d = $derived(report.domain);
  let checks = $derived(report.domainChecks ?? []);
  let r = $derived(rollup(checks, report.domain ? 'Registered' : 'No data'));
  let exp = $derived(daysUntil(d?.expires));
  let ageY = $derived(d?.created ? (Date.now() - Date.parse(d.created)) / (365.25 * 86_400_000) : null);
</script>

<Card id="domain" title="Domain" desc="Registration data from RDAP, nameservers and DNSSEC." chip={r.label} tone={r.tone}>
  {#if d}
    <div class="ss-tiles">
      <div class="ss-tile"><div class="k">Registered</div><div class="v">{ageY === null ? '—' : ageY >= 1 ? ageY.toFixed(1) : Math.round(ageY * 12)}<small>{ageY === null ? '' : ageY >= 1 ? ' years ago' : ' months ago'}</small></div><div class="t">{fmtDate(d.created)}</div></div>
      <div class="ss-tile {exp === null ? '' : exp < 30 ? 'bad' : exp < 90 ? 'warn' : ''}"><div class="k">Expires in</div><div class="v">{exp ?? '—'}<small>{exp === null ? '' : ' days'}</small></div><div class="t">{fmtDate(d.expires)}</div></div>
      <div class="ss-tile"><div class="k">Registrar</div><div class="v" style="font-size: var(--text-lg)">{d.registrar ?? '—'}</div></div>
      <div class="ss-tile"><div class="k">DNSSEC</div><div class="v" style="font-size: var(--text-lg)">{report.dns?.dnssec ? 'Validated' : d.dnssecSigned ? 'Signed' : 'Not enabled'}</div></div>
    </div>
    {#if checks.length}<Findings findings={checks} {open} />{/if}
    <dl class="ss-kv">
      <dt>Domain</dt><dd>{report.target.registrableDomain}</dd>
      {#if d.status.length}<dt>Registry status</dt><dd><span class="chips">{#each d.status as st}<span class="ss-chip">{st}</span>{/each}</span></dd>{/if}
      {#if d.nameservers.length || report.dns?.NS.length}<dt>Nameservers</dt><dd>{#each (report.dns?.NS.length ? report.dns.NS : d.nameservers) as ns}<div class="ss-mono">{ns}</div>{/each}{#if report.infra.dnsProvider}<span class="sub">{report.infra.dnsProvider.name}</span>{/if}</dd>{/if}
      {#if report.external.wayback}<dt>First archived</dt><dd>{fmtDate(report.external.wayback)}<span class="sub">Earliest snapshot in the Wayback Machine</span></dd>{/if}
      {#if report.cert?.notAfter}<dt>Certificate</dt><dd>{dot(`Expires ${fmtDate(report.cert.notAfter)}`, report.cert.issuer ? `issued by ${report.cert.issuer}` : null)}</dd>{/if}
      {#if d.updated}<dt>Record updated</dt><dd>{fmtDate(d.updated)}</dd>{/if}
    </dl>
  {:else}
    <p class="ss-empty">Registration data is not available for this domain. Some registries (and country-code domains) do not publish RDAP records.</p>
  {/if}
</Card>
