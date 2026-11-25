<script lang="ts">
  import type { Report } from '@site-scanner/core/types';
  import { daysUntil, fmtDate } from '$lib/utils/format';
  import Card from '$lib/components/report/Card.svelte';
  import { platformLabel } from '$lib/components/report/helpers';
  let { report, running = false }: { report: Report; running?: boolean } = $props();

  // Same "what it's built with" filter as the Technology card, so the two never disagree.
  const notBuiltWith = /^(Webmail|Hosting|CDN|Miscellaneous|Email|Security|PaaS|IaaS|Reverse proxies|Load balancers|SSL\/TLS certificate authorities|Domain parking|Web servers)$/;
  let built = $derived(report.technologies.filter((t) => !t.implied && t.confidence !== 'low' && !t.categories.every((c) => notBuiltWith.test(c.name))));
  let d = $derived(report.domain);
  let exp = $derived(daysUntil(d?.expires));
  let i = $derived(report.infra);
  let platform = $derived(platformLabel(report));
  const pending = (what: string) => (running ? 'Looking up…' : what);
</script>

<Card id="facts" title="Key facts" desc="Who registered the domain, where the site is hosted and what it is built with.">
  <dl class="ss-kv">
    <dt>Registrar</dt>
    <dd>
      {#if d?.registrar}{d.registrar}{:else if d}Not published{:else}<span class="ss-muted">{pending('Not available')}</span>{/if}
      {#if d?.expires}<span class="sub">Expires {fmtDate(d.expires)}{exp !== null ? ` · in ${exp} days` : ''}</span>{/if}
    </dd>
    <dt>Hosting</dt>
    <dd>
      {#if i.hosting}{i.hosting.name}{#if i.hosting.confidence !== 'high'}<span class="sub">{i.hosting.confidence} confidence</span>{/if}
      {:else if i.cdn}Not publicly detectable<span class="sub">Served through {i.cdn.name}, which hides the origin</span>
      {:else}<span class="ss-muted">{pending('Unknown')}</span>{/if}
    </dd>
    {#if i.cdn || i.waf}<dt>CDN / WAF</dt><dd>{[i.cdn?.name, i.waf && i.waf.name !== i.cdn?.name ? i.waf.name : null].filter(Boolean).join(' · ')}</dd>{/if}
    {#if i.dnsProvider || i.emailProvider}<dt>DNS / Email</dt><dd>{i.dnsProvider?.name ?? '—'} · {i.emailProvider?.name ?? 'No email provider found'}</dd>{/if}
    {#if platform}<dt>Platform</dt><dd>{platform}{report.cms?.version ? ` ${report.cms.version}` : ''}</dd>{/if}
    <dt>Technology</dt>
    <dd>
      {#if built.length}
        <span class="chips">{#each built.slice(0, 12) as t (t.slug)}<span class="ss-chip">{t.name}{t.version ? ` ${t.version}` : ''}</span>{/each}</span>
        {#if built.length > 12 || report.technologies.length > built.length}<a class="sub" href="#s-stack">All {report.technologies.length} technologies</a>{/if}
      {:else}<span class="ss-muted">{pending('Nothing identified with confidence')}</span>{/if}
    </dd>
  </dl>
</Card>
