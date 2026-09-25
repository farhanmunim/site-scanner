<script lang="ts">
  import { onMount } from 'svelte';
  import type { Report, StageMeta, StageName } from '@site-scanner/core/types';
  import Stages from '$lib/components/Stages.svelte';
  import TechCard from '$lib/components/TechCard.svelte';
  import Finding from '$lib/components/Finding.svelte';
  import Evidence from '$lib/components/Evidence.svelte';
  import { ago, daysUntil, fmtBytes, fmtDate, fmtMs } from '$lib/format';

  let { data } = $props();
  let status = $state(data.scan.status);
  let stages = $state<Partial<Record<StageName, StageMeta>>>(data.scan.stages ?? {});
  let report = $state<Report | null>(data.scan.report ?? null);
  let scanError = $state<string | null>(data.scan.error ?? null);
  let running = $derived(status === 'queued' || status === 'running');

  onMount(() => {
    if (!running) return;
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    const apply = (d: { status: string; stages?: typeof stages; report?: Report | null; error?: string | null }) => {
      status = d.status as typeof status;
      if (d.stages) stages = d.stages;
      if (d.report) report = d.report;
      scanError = d.error ?? null;
      if (!['queued', 'running'].includes(d.status)) {
        es?.close();
        if (poll) clearInterval(poll);
      }
    };
    try {
      es = new EventSource(`/api/scans/${data.scan.id}/events`);
      es.onmessage = (e) => apply(JSON.parse(e.data));
      es.onerror = () => {
        es?.close();
        poll ??= setInterval(async () => apply(await (await fetch(`/api/scans/${data.scan.id}`)).json()), 2000);
      };
    } catch {
      poll = setInterval(async () => apply(await (await fetch(`/api/scans/${data.scan.id}`)).json()), 2000);
    }
    return () => {
      es?.close();
      if (poll) clearInterval(poll);
    };
  });

  const qualityText: Record<string, string> = { complete: 'Complete', partial: 'Partial', restricted: 'Restricted by the site', failed: 'Failed', queued: 'Queued', running: 'Scanning' };
  const nav = [
    ['overview', 'Overview'],
    ['technology', 'Technology'],
    ['infrastructure', 'Infrastructure'],
    ['domain', 'Domain & DNS'],
    ['security', 'Security'],
    ['email', 'Email'],
    ['seo', 'SEO'],
    ['performance', 'Performance'],
    ['privacy', 'Privacy & third parties'],
    ['cms', 'CMS']
  ];
  let techFilter = $state('');
  let filteredTechs = $derived((report?.technologies ?? []).filter((t) => !techFilter || t.name.toLowerCase().includes(techFilter.toLowerCase()) || t.categories.some((c) => c.name.toLowerCase().includes(techFilter.toLowerCase()))));
  let byCategory = $derived.by(() => {
    const m = new Map<string, typeof filteredTechs>();
    for (const t of filteredTechs) {
      const k = t.categories[0]?.name ?? 'Other';
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return [...m.entries()];
  });
  const gradeClass = (n: number | null) => (n === null ? 'neutral' : n >= 90 ? 'good' : n >= 50 ? 'warn' : 'bad');
  const counts = (fs: { status: string }[] | undefined) => ({ good: fs?.filter((f) => f.status === 'good').length ?? 0, warn: fs?.filter((f) => f.status === 'warn').length ?? 0, bad: fs?.filter((f) => f.status === 'bad').length ?? 0 });
</script>

<svelte:head>
  <title>{data.scan.displayHost} — technology & infrastructure report</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if data.notice}<p class="alert" role="status">{data.notice}</p>{/if}

<div class="row" style="justify-content: space-between; align-items: flex-start; margin-bottom: 12px">
  <div>
    <h1 style="margin-bottom: 2px"><a href={report?.http?.finalUrl ?? data.scan.url} rel="noopener nofollow" target="_blank" style="color: inherit">{data.scan.displayHost}</a></h1>
    <div class="muted small">
      <span class="pill {status === 'complete' ? 'good' : status === 'failed' ? 'bad' : running ? 'info' : 'warn'}">{qualityText[status] ?? status}</span>
      · scanned {ago(data.scan.createdAt)}{#if data.scan.durationMs} in {fmtMs(data.scan.durationMs)}{/if}
      {#if report?.scan.scannerVersion} · scanner {report.scan.scannerVersion}{/if}{#if report?.scan.fingerprintsVersion} · fingerprints {report.scan.fingerprintsVersion}{/if}
    </div>
  </div>
  <div class="row">
    <a class="button secondary" href="/api/scans/{data.scan.id}" rel="nofollow">JSON</a>
    <form method="POST" action="/?/default" style="display: inline"><input type="hidden" name="url" value={data.scan.url} /><button class="secondary" type="submit" title="Runs a fresh scan if the cached result is older than 15 minutes">Scan again</button></form>
  </div>
</div>

{#if running || !report}
  <div class="card">
    <h2>{running ? 'Scanning…' : 'No results'}</h2>
    <Stages {stages} {running} />
    {#if scanError}<p class="alert bad" style="margin-top: 12px">{scanError}</p>{/if}
    {#if running}<p class="muted small" style="margin-top: 12px">Results appear as each stage finishes. A full scan usually takes 10–40 seconds.</p>{/if}
  </div>
{/if}

{#if report}
  <nav class="report-nav" aria-label="Report sections">
    {#each nav as [id, label]}<a href="#{id}">{label}</a>{/each}
  </nav>

  {#if report.safeBrowsing?.threats.length}
    <p class="alert bad" role="alert"><strong>Google Safe Browsing flags this site:</strong> {report.safeBrowsing.threats.join(', ')}. Visit with care.</p>
  {/if}
  {#if report.http?.challenge || report.scan.quality === 'restricted'}
    <p class="alert warn">This website restricts automated access{#if report.http?.challenge} ({report.http.challenge.vendor}){/if}. DNS, domain and certificate information were still collected; page-based findings may be incomplete.</p>
  {/if}

  <section class="report-section" id="overview">
    <div class="grid">
      <div class="card" style="grid-column: span 2">
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(120px, 1fr))">
          <div class="stat"><span class="value">{report.technologies.length}</span><span class="label">technologies</span></div>
          <div class="stat"><span class="value">{report.thirdParties.length}</span><span class="label">third-party domains</span></div>
          {#if report.security.length}{@const c = counts(report.security)}<div class="stat"><span class="value">{c.bad + c.warn}</span><span class="label">security items to review</span></div>{/if}
          {#if report.seo}{@const c = counts(report.seo.findings)}<div class="stat"><span class="value">{c.bad + c.warn}</span><span class="label">SEO items to review</span></div>{/if}
          {#if report.performance?.scores.performance !== null && report.performance}<div class="stat"><span class="value">{report.performance.scores.performance}</span><span class="label">Lighthouse performance</span></div>{/if}
        </div>
        <dl class="kv" style="margin-top: 14px">
          <dt>Final URL</dt><dd class="mono">{report.http?.finalUrl ?? '—'} {#if report.http?.status}<span class="pill {report.http.status < 400 ? 'good' : 'bad'}">HTTP {report.http.status}</span>{/if}</dd>
          {#if report.cms}<dt>Platform</dt><dd>{report.cms.platform === 'wordpress' ? 'WordPress' : 'Shopify'}{#if report.cms.version} {report.cms.version}{/if}{#if report.cms.theme} · theme {report.cms.theme.name ?? report.cms.theme.slug}{/if}</dd>{/if}
          <dt>CDN / WAF</dt><dd>{report.infra.cdn?.name ?? 'None observed'}{#if report.infra.waf && report.infra.waf.name !== report.infra.cdn?.name} · {report.infra.waf.name}{/if}</dd>
          <dt>Hosting</dt><dd>{#if report.infra.hosting}{report.infra.hosting.name} <span class="pill {report.infra.hosting.confidence}">{report.infra.hosting.confidence}</span>{:else if report.infra.cdn}Not publicly detectable (behind {report.infra.cdn.name}){:else}Unknown{/if}</dd>
          <dt>DNS / Email</dt><dd>{report.infra.dnsProvider?.name ?? '—'} · {report.infra.emailProvider?.name ?? 'no email'}</dd>
          {#if report.external.wayback}<dt>Online since</dt><dd>at least {fmtDate(report.external.wayback)} (Wayback Machine)</dd>{/if}
        </dl>
        <div class="chips" style="margin-top: 12px">
          {#each report.technologies.filter((t) => !t.implied).slice(0, 18) as t}<a class="pill neutral" href="#tech-{t.slug}">{t.name}</a>{/each}
        </div>
      </div>
      <div class="card">
        {#if report.screenshot}
          {#if 'url' in report.screenshot}<img class="screenshot" src={report.screenshot.url} alt="Screenshot of {data.scan.displayHost}" width={report.screenshot.width} height={report.screenshot.height} loading="lazy" />{:else}<img class="screenshot" src={report.screenshot.dataUrl} alt="Screenshot of {data.scan.displayHost} (from Lighthouse)" />{/if}
        {:else}
          <p class="muted small">No screenshot{running ? ' yet' : ''}.</p>
        {/if}
        <details style="margin-top: 8px"><summary>Scan stages</summary><Stages {stages} {running} /></details>
      </div>
    </div>
  </section>

  <section class="report-section" id="technology">
    <div class="row" style="justify-content: space-between">
      <h2>Technology <span class="muted">({report.technologies.length})</span></h2>
      <input type="search" placeholder="Filter…" bind:value={techFilter} style="max-width: 220px" aria-label="Filter technologies" />
    </div>
    {#if report.technologies.length === 0}
      <div class="card"><p>No technology could be confidently identified. This does not mean the site uses no framework — the public response did not contain enough evidence{report.scan.quality === 'restricted' ? ', and the site restricted automated access' : ''}.</p></div>
    {/if}
    {#each byCategory as [cat, techs]}
      <h3 style="margin-top: 14px">{cat}</h3>
      <div class="tech-grid">
        {#each techs as t (t.slug)}<div id="tech-{t.slug}"><TechCard tech={t} /></div>{/each}
      </div>
    {/each}
  </section>

  <section class="report-section" id="infrastructure">
    <h2>Infrastructure</h2>
    <div class="card">
      <dl class="kv">
        <dt>CDN / reverse proxy</dt><dd>{#if report.infra.cdn}{report.infra.cdn.name}<details><summary>Evidence</summary><Evidence items={report.infra.cdn.evidence} /></details>{:else}None observed{/if}</dd>
        <dt>WAF / bot protection</dt><dd>{#if report.infra.waf}{report.infra.waf.name}{#if report.infra.waf.evidence.length}<details><summary>Evidence</summary><Evidence items={report.infra.waf.evidence} /></details>{/if}{:else}None observed{/if}</dd>
        <dt>Hosting / origin</dt><dd>{#if report.infra.hosting}{report.infra.hosting.name} <span class="pill {report.infra.hosting.confidence}">{report.infra.hosting.confidence} confidence</span><details><summary>Evidence</summary><Evidence items={report.infra.hosting.evidence} /></details>{:else if report.infra.cdn}<strong>Not publicly detectable.</strong> The site is served through {report.infra.cdn.name}; the public scan did not expose enough evidence to identify the origin infrastructure.{:else}Unknown{/if}</dd>
        <dt>Web server</dt><dd>{report.http?.server ?? 'Not disclosed'}{#if report.http?.poweredBy} · {report.http.poweredBy}{/if}</dd>
        <dt>Protocol</dt><dd>{report.tls?.alpn === 'h2' ? 'HTTP/2' : report.tls?.alpn ? report.tls.alpn : '—'}{#if report.http?.http3} · HTTP/3 advertised{/if}{#if report.http?.compression} · {report.http.compression} compression{/if}</dd>
        {#if report.infra.ips.length}
          <dt>IP addresses</dt>
          <dd>
            {#each report.infra.ips as ip}<div class="mono small">{ip.ip}{#if ip.asn} · AS{ip.asn} {ip.asnOrg ?? ''}{/if}{#if ip.country} · {ip.country}{/if}{#if ip.reverseDns} · {ip.reverseDns}{/if}</div>{/each}
          </dd>
        {/if}
        {#if report.external.greenHosting}<dt>Green hosting</dt><dd>{report.external.greenHosting.green ? `Yes — ${report.external.greenHosting.hostedBy ?? 'listed by the Green Web Foundation'}` : 'Not listed by the Green Web Foundation'}</dd>{/if}
        {#if Object.keys(report.http?.cacheHeaders ?? {}).length}<dt>Caching headers</dt><dd>{#each Object.entries(report.http?.cacheHeaders ?? {}) as [k, v]}<div class="mono small">{k}: {v}</div>{/each}</dd>{/if}
        {#if report.http?.chain && report.http.chain.length > 1}<dt>Redirect chain</dt><dd>{#each report.http.chain as hop}<div class="mono small">{hop.status} {hop.url}{#if hop.location} → {hop.location}{/if}</div>{/each}</dd>{/if}
      </dl>
    </div>
  </section>

  <section class="report-section" id="domain">
    <h2>Domain &amp; DNS</h2>
    <div class="grid">
      <div class="card">
        <h3>Registration</h3>
        {#if report.domain}
          <dl class="kv">
            <dt>Registrar</dt><dd>{report.domain.registrar ?? 'Redacted / not provided'}</dd>
            <dt>Registered</dt><dd>{fmtDate(report.domain.created)}</dd>
            <dt>Expires</dt><dd>{fmtDate(report.domain.expires)}{#if daysUntil(report.domain.expires) !== null}{@const d = daysUntil(report.domain.expires)} <span class="pill {d! < 30 ? 'bad' : d! < 90 ? 'warn' : 'neutral'}">{d} days</span>{/if}</dd>
            <dt>Status</dt><dd class="small">{report.domain.status.join(', ') || '—'}</dd>
            <dt>DNSSEC (registry)</dt><dd>{report.domain.dnssecSigned === null ? 'Unknown' : report.domain.dnssecSigned ? 'Signed' : 'Not signed'}</dd>
          </dl>
        {:else}<p class="muted">Registration data (RDAP) was not available for this domain.</p>{/if}
      </div>
      <div class="card">
        <h3>Certificate</h3>
        {#if report.cert}
          <dl class="kv">
            <dt>Issuer</dt><dd>{report.cert.issuer ?? '—'}</dd>
            <dt>Subject</dt><dd class="mono">{report.cert.subject ?? '—'}</dd>
            <dt>Valid</dt><dd>{fmtDate(report.cert.notBefore)} → {fmtDate(report.cert.notAfter)}{#if daysUntil(report.cert.notAfter) !== null}{@const d = daysUntil(report.cert.notAfter)} <span class="pill {d! < 7 ? 'bad' : d! < 21 ? 'warn' : 'good'}">{d} days</span>{/if}</dd>
            <dt>Validation</dt><dd>{report.tls?.authorized ? 'Valid chain' : (report.tls?.authorizationError ?? 'Unknown')} <span class="muted small">({report.cert.source === 'handshake' ? 'live handshake' : 'Certificate Transparency log'})</span></dd>
            <dt>TLS</dt><dd>{report.tls?.protocol ?? '—'}</dd>
            {#if report.cert.sans.length}<dt>Names</dt><dd class="small mono">{report.cert.sans.slice(0, 12).join(', ')}{#if report.cert.sans.length > 12} +{report.cert.sans.length - 12} more{/if}</dd>{/if}
          </dl>
        {:else}<p class="muted">No certificate information available.</p>{/if}
      </div>
    </div>
    {#if report.dns}
      <div class="card">
        <h3>DNS records</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Type</th><th>Value</th></tr></thead>
            <tbody>
              {#each report.dns.A as v}<tr><td>A</td><td class="mono">{v}</td></tr>{/each}
              {#each report.dns.AAAA as v}<tr><td>AAAA</td><td class="mono">{v}</td></tr>{/each}
              {#each report.dns.CNAME as v}<tr><td>CNAME</td><td class="mono">{v}</td></tr>{/each}
              {#each report.dns.NS as v}<tr><td>NS</td><td class="mono">{v}</td></tr>{/each}
              {#each report.dns.MX as v}<tr><td>MX</td><td class="mono">{v.priority} {v.exchange}</td></tr>{/each}
              {#each report.dns.TXT as v}<tr><td>TXT</td><td class="mono small">{v}</td></tr>{/each}
              {#each report.dns.CAA as v}<tr><td>CAA</td><td class="mono">{v}</td></tr>{/each}
              {#if report.dns.SOA}<tr><td>SOA</td><td class="mono small">{report.dns.SOA}</td></tr>{/if}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  </section>

  <section class="report-section" id="security">
    <h2>Security configuration</h2>
    <p class="muted small">Observable configuration only. A missing header is a hardening opportunity, not proof of a vulnerability. Labels map findings to OWASP Top 10 (2021) categories.</p>
    <div class="card">
      {#each report.security as f (f.id)}<Finding finding={f} />{:else}<p class="muted">No HTTP response to assess.</p>{/each}
    </div>
    {#if report.cookies.length}
      <div class="card">
        <h3>Cookies set on load ({report.cookies.length})</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Domain</th><th>Secure</th><th>HttpOnly</th><th>SameSite</th><th>Lifetime</th><th>Party</th></tr></thead>
            <tbody>{#each report.cookies as c}<tr><td class="mono">{c.name}</td><td class="mono small">{c.domain}</td><td>{c.secure ? '✓' : '—'}</td><td>{c.httpOnly ? '✓' : '—'}</td><td>{c.sameSite ?? '—'}</td><td>{c.session ? 'session' : 'persistent'}</td><td>{c.thirdParty ? 'third' : 'first'}</td></tr>{/each}</tbody>
          </table>
        </div>
      </div>
    {/if}
  </section>

  <section class="report-section" id="email">
    <h2>Email &amp; DNS security</h2>
    <div class="card">{#each report.email as f (f.id)}<Finding finding={f} />{/each}</div>
  </section>

  <section class="report-section" id="seo">
    <h2>SEO</h2>
    {#if report.seo}
      <div class="grid">
        <div class="card" style="grid-column: span 2">{#each report.seo.findings as f (f.id)}<Finding finding={f} />{/each}</div>
        <div class="card">
          <dl class="kv" style="grid-template-columns: 1fr">
            <dt>Title</dt><dd>{report.seo.title ?? '—'}</dd>
            <dt>Meta description</dt><dd class="small">{report.seo.metaDescription ?? '—'}</dd>
            <dt>Canonical</dt><dd class="mono small">{report.seo.canonical ?? '—'}</dd>
            <dt>Language</dt><dd>{report.seo.lang ?? '—'}</dd>
            <dt>Headings</dt><dd class="small">{Object.entries(report.seo.headingCounts).map(([k, v]) => `${k}: ${v}`).join(' · ')}</dd>
            <dt>Links</dt><dd class="small">{report.seo.links.internal} internal · {report.seo.links.external} external · {report.seo.links.nofollow} nofollow</dd>
            {#if report.seo.hreflang.length}<dt>hreflang</dt><dd class="small">{report.seo.hreflang.join(', ')}</dd>{/if}
            {#if Object.keys(report.seo.openGraph).length}<dt>Open Graph</dt><dd class="small">{#each Object.entries(report.seo.openGraph) as [k, v]}<div><span class="muted">{k}</span> {v}</div>{/each}</dd>{/if}
          </dl>
        </div>
      </div>
      {#if report.robots}
        <div class="card">
          <h3>robots.txt &amp; well-known files</h3>
          <dl class="kv">
            <dt>robots.txt</dt><dd>{report.robots.present ? `${report.robots.groups} group(s)${report.robots.disallowAll ? ' — disallows everything' : ''}` : 'Not found'}</dd>
            {#if report.robots.sitemaps.length}<dt>Sitemaps</dt><dd class="mono small">{report.robots.sitemaps.join(', ')}</dd>{/if}
            <dt>AI crawlers</dt><dd class="chips">{#each report.robots.aiCrawlers as a}<span class="pill {a.blocked ? 'warn' : 'neutral'}">{a.agent}: {a.blocked ? 'blocked' : 'allowed'}</span>{/each}</dd>
            <dt>security.txt</dt><dd>{report.wellKnown.securityTxt ? 'Present' : 'Not found'}</dd>
            <dt>ads.txt</dt><dd>{report.wellKnown.adsTxt ? 'Present' : 'Not found'}</dd>
            <dt>llms.txt</dt><dd>{report.wellKnown.llmsTxt ? 'Present' : 'Not found'}</dd>
          </dl>
        </div>
      {/if}
    {:else}<div class="card"><p class="muted">No page to assess.</p></div>{/if}
  </section>

  <section class="report-section" id="performance">
    <h2>Performance &amp; accessibility</h2>
    {#if report.performance}
      {@const p = report.performance}
      <div class="card">
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(120px, 1fr))">
          {#each [['Performance', p.scores.performance], ['Accessibility', p.scores.accessibility], ['Best practices', p.scores.bestPractices], ['SEO', p.scores.seo]] as [label, v]}
            <div class="stat"><span class="value"><span class="pill {gradeClass(v as number | null)}" style="font-size: 1.1rem">{v ?? '—'}</span></span><span class="label">{label}</span></div>
          {/each}
        </div>
        <p class="muted small" style="margin-top: 10px">Lighthouse {p.lighthouseVersion ?? ''} via Google PageSpeed Insights, {p.strategy} emulation, run {fmtDate(p.fetchedAt, true)}. Lab numbers vary between runs; field data (when present) is what real Chrome users experienced over 28 days.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Metric</th><th>Lab</th><th>Field (CrUX)</th></tr></thead>
            <tbody>
              <tr><td>Largest Contentful Paint</td><td>{fmtMs(p.lab.lcpMs)}</td><td>{fmtMs(p.field?.lcpMs)}</td></tr>
              <tr><td>Cumulative Layout Shift</td><td>{p.lab.cls?.toFixed(3) ?? '—'}</td><td>{p.field?.cls?.toFixed(3) ?? '—'}</td></tr>
              <tr><td>Total Blocking Time / INP</td><td>{fmtMs(p.lab.tbtMs)}</td><td>{fmtMs(p.field?.inpMs)}</td></tr>
              <tr><td>First Contentful Paint / TTFB</td><td>{fmtMs(p.lab.fcpMs)}</td><td>{fmtMs(p.field?.ttfbMs)}</td></tr>
              <tr><td>Speed Index</td><td>{fmtMs(p.lab.speedIndexMs)}</td><td>—</td></tr>
              <tr><td>Page weight / requests</td><td>{fmtBytes(p.totalBytes)} / {p.requestCount ?? '—'}</td><td>{p.field?.overall ?? '—'}</td></tr>
            </tbody>
          </table>
        </div>
        {#if p.accessibilityIssues.length}
          <h3 style="margin-top: 14px">Automated accessibility checks</h3>
          <p class="muted small">Automated checks are not a complete accessibility audit.</p>
          <ul class="small">{#each p.accessibilityIssues as a}<li>{a.title} <span class="muted">({a.count})</span></li>{/each}</ul>
        {/if}
      </div>
    {:else}<div class="card"><p class="muted">Performance data not available{running ? ' yet' : ''} (PageSpeed Insights is optional and needs an API key).</p></div>{/if}
  </section>

  <section class="report-section" id="privacy">
    <h2>Privacy &amp; third parties</h2>
    <div class="card">{#each report.privacy as f (f.id)}<Finding finding={f} />{/each}</div>
    {#if report.thirdParties.length}
      <div class="card">
        <h3>Third-party domains ({report.thirdParties.length})</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Domain</th><th>Service</th><th>Category</th><th>Requests</th></tr></thead>
            <tbody>{#each report.thirdParties as t}<tr><td class="mono small">{t.domain}</td><td>{t.technology ?? '—'}</td><td class="muted">{t.category ?? '—'}</td><td>{t.count}</td></tr>{/each}</tbody>
          </table>
        </div>
      </div>
    {/if}
  </section>

  {#if report.cms}
    <section class="report-section" id="cms">
      <h2>{report.cms.platform === 'wordpress' ? 'WordPress' : 'Shopify'} deep dive</h2>
      <div class="card">
        <dl class="kv">
          {#if report.cms.version}<dt>Core version</dt><dd>{report.cms.version}</dd>{/if}
          {#if report.cms.theme}<dt>Theme</dt><dd>{report.cms.theme.name ?? report.cms.theme.slug}{#if report.cms.theme.version} {report.cms.theme.version}{/if}{#if report.cms.theme.author} · by {report.cms.theme.author}{/if} <span class="muted small mono">({report.cms.theme.slug})</span></dd>{/if}
        </dl>
        {#if report.cms.plugins.length}
          <h3 style="margin-top: 12px">{report.cms.platform === 'wordpress' ? 'Plugins' : 'Apps'} ({report.cms.plugins.length})</h3>
          <p class="muted small">Only {report.cms.platform === 'wordpress' ? 'plugins whose assets the homepage loads' : 'apps detectable from the storefront'} are listed; others may exist.</p>
          <div class="table-wrap"><table><thead><tr><th>Name</th><th>Slug</th><th>Version</th></tr></thead><tbody>{#each report.cms.plugins as p}<tr><td>{p.name ?? '—'}</td><td class="mono small">{p.slug}</td><td>{p.version ?? '—'}</td></tr>{/each}</tbody></table></div>
        {/if}
        {#if report.cms.flags.length}<div style="margin-top: 12px">{#each report.cms.flags as f (f.id)}<Finding finding={f} />{/each}</div>{/if}
      </div>
    </section>
  {/if}
{/if}
