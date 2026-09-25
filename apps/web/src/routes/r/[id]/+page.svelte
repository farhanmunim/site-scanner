<script lang="ts">
  import { onMount } from 'svelte';
  import type { Finding, Report, StageMeta, StageName } from '@site-scanner/core/types';
  import Stages from '$lib/components/Stages.svelte';
  import Light from '$lib/components/Light.svelte';
  import FindingsTable from '$lib/components/FindingsTable.svelte';
  import Evidence from '$lib/components/Evidence.svelte';
  import { ago, daysUntil, fmtBytes, fmtDate, fmtMs } from '$lib/format';

  import { page } from '$app/state';
  let { data } = $props();
  let printMode = $derived(page.url.searchParams.get('print') === '1');
  let status = $state(data.scan.status);
  let stages = $state<Partial<Record<StageName, StageMeta>>>(data.scan.stages ?? {});
  let report = $state<Report | null>(data.scan.report ?? null);
  let scanError = $state<string | null>(data.scan.error ?? null);
  let running = $derived(status === 'queued' || status === 'running');

  onMount(() => {
    if (printMode) {
      document.body.classList.add('print-mode');
      for (const d of document.querySelectorAll('details')) d.open = true;
    }
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
    const startPoll = () => {
      poll ??= setInterval(async () => apply(await (await fetch(`/api/scans/${data.scan.id}`)).json()), 2000);
    };
    try {
      es = new EventSource(`/api/scans/${data.scan.id}/events`);
      es.onmessage = (e) => apply(JSON.parse(e.data));
      es.onerror = () => {
        es?.close();
        startPoll();
      };
    } catch {
      startPoll();
    }
    return () => {
      es?.close();
      if (poll) clearInterval(poll);
    };
  });

  const statusText: Record<string, string> = { complete: 'Complete', partial: 'Partly complete', restricted: 'Limited — site blocks bots', failed: 'Failed', queued: 'Queued', running: 'Scanning' };
  const nav = [
    ['overview', 'Overview'],
    ['technology', 'Technology'],
    ['infrastructure', 'Hosting'],
    ['domain', 'Domain & DNS'],
    ['security', 'Security'],
    ['email', 'Email'],
    ['seo', 'SEO'],
    ['performance', 'Performance'],
    ['privacy', 'Privacy'],
    ['cms', 'CMS']
  ];
  const confLight = { high: 'green', medium: 'amber', low: 'grey' } as const;
  const confWord = { high: 'Certain', medium: 'Likely', low: 'Possible' } as const;

  /** Roll a list of findings up into one traffic light + short sentence. */
  function rollup(fs: Finding[] | undefined): { light: 'green' | 'amber' | 'red' | 'grey'; text: string } {
    if (!fs || !fs.length) return { light: 'grey', text: 'Not checked' };
    const bad = fs.filter((f) => f.status === 'bad').length;
    const warn = fs.filter((f) => f.status === 'warn').length;
    if (bad) return { light: 'red', text: `${bad} thing${bad > 1 ? 's' : ''} to fix${warn ? `, ${warn} to check` : ''}` };
    if (warn) return { light: 'amber', text: `${warn} thing${warn > 1 ? 's' : ''} worth checking` };
    return { light: 'green', text: 'Nothing to fix' };
  }
  const scoreLight = (n: number | null) => (n === null ? 'grey' : n >= 90 ? 'green' : n >= 50 ? 'amber' : 'red');
  let techFilter = $state('');
  let techs = $derived((report?.technologies ?? []).filter((t) => !techFilter || t.name.toLowerCase().includes(techFilter.toLowerCase()) || t.categories.some((c) => c.name.toLowerCase().includes(techFilter.toLowerCase()))));
  let hasCms = $derived(!!report?.cms);
  /** Categories that are infrastructure or metadata rather than "what the site is built with". */
  const notBuiltWith = /^(Webmail|Hosting|CDN|Miscellaneous|Email|Security|PaaS|IaaS|Reverse proxies|Load balancers|SSL\/TLS certificate authorities|Domain parking|Web servers)$/;
  let builtWith = $derived((report?.technologies ?? []).filter((t) => !t.implied && t.confidence !== 'low' && !t.categories.every((c) => notBuiltWith.test(c.name))).slice(0, 14));
  const typeLabel = (t: { name: string; categories: { name: string }[] }) => (/ DNS$/.test(t.name) ? 'DNS provider' : t.categories.map((c) => c.name).join(', '));
  let serverSoftware = $derived.by(() => {
    const s = report?.http?.server;
    if (!s) return 'Not disclosed';
    if (report?.infra.cdn && new RegExp(report.infra.cdn.name.split(' ')[0]!, 'i').test(s)) return `Not disclosed (behind ${report.infra.cdn.name})`;
    return s;
  });
</script>

<svelte:head>
  <title>{data.scan.displayHost} — website report</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if data.notice}<p class="alert" role="status">{data.notice}</p>{/if}

<div class="report-head">
  <div>
    <h1><a href={report?.http?.finalUrl ?? data.scan.url} rel="noopener nofollow" target="_blank" style="color: inherit">{data.scan.displayHost}</a></h1>
    <div class="meta">
      <span class="pill {status === 'complete' ? 'green' : status === 'failed' ? 'red' : running ? 'blue' : 'amber'}">{statusText[status] ?? status}</span>
      <span>Scanned {ago(data.scan.createdAt)}{#if data.scan.durationMs}&nbsp;in {fmtMs(data.scan.durationMs)}{/if}</span>
    </div>
  </div>
  <div class="row">
    {#if !running}<a class="button secondary" href="/r/{data.scan.id}/pdf" rel="nofollow">Download PDF</a>{/if}
    <a class="button secondary" href="/api/scans/{data.scan.id}" rel="nofollow">JSON</a>
    <form method="POST" action="/?/default" style="display: inline"><input type="hidden" name="url" value={data.scan.url} /><button class="secondary" type="submit" title="Runs a fresh scan if the cached result is older than 15 minutes">Scan again</button></form>
  </div>
</div>

{#if running || !report}
  <div class="panel">
    <header><h2>{running ? 'Scanning…' : 'No results'}</h2>{#if running}<span class="hint">Results appear as each step finishes</span>{/if}</header>
    <div class="body">
      <Stages {stages} {running} />
      {#if scanError}<p class="alert red" style="margin-top: 12px">{scanError}</p>{/if}
    </div>
  </div>
{/if}

{#if report}
  <nav class="report-nav" aria-label="Report sections">
    {#each nav as [id, label]}{#if id !== 'cms' || hasCms}<a href="#{id}">{label}</a>{/if}{/each}
  </nav>

  {#if report.safeBrowsing?.threats.length}
    <p class="alert red" role="alert"><strong>Google Safe Browsing flags this site</strong> ({report.safeBrowsing.threats.join(', ').toLowerCase()}). Visit with care.</p>
  {/if}
  {#if report.http?.challenge || report.scan.quality === 'restricted'}
    <p class="alert amber">This website blocks automated visitors{#if report.http?.challenge} ({report.http.challenge.vendor}){/if}, so page-based checks are limited. Domain, DNS and certificate information was still collected.</p>
  {/if}

  <section class="report-section" id="overview">
    <div class="overview">
      <div>
        <div class="panel" style="margin-top: 0">
          <header><h2>At a glance</h2></header>
          <table>
            <tbody>
              <tr><td class="w-status"><Light status={report.http?.status && report.http.status < 400 ? 'green' : 'red'} label={report.http?.status ? `HTTP ${report.http.status}` : 'No response'} /></td><td class="w-label">Site reachable</td><td class="wrap mono small">{report.http?.finalUrl ?? '—'}</td></tr>
              {#if report.security.length}{@const r = rollup(report.security)}<tr><td class="w-status"><Light status={r.light} /></td><td class="w-label"><a href="#security">Security setup</a></td><td>{r.text}</td></tr>{/if}
              {#if report.email.length}{@const r = rollup(report.email)}<tr><td class="w-status"><Light status={r.light} /></td><td class="w-label"><a href="#email">Email protection</a></td><td>{r.text}</td></tr>{/if}
              {#if report.seo}{@const r = rollup(report.seo.findings)}<tr><td class="w-status"><Light status={r.light} /></td><td class="w-label"><a href="#seo">SEO basics</a></td><td>{r.text}</td></tr>{/if}
              {#if report.performance}<tr><td class="w-status"><Light status={scoreLight(report.performance.scores.performance)} label={String(report.performance.scores.performance ?? '—')} /></td><td class="w-label"><a href="#performance">Performance score</a></td><td>Lighthouse, mobile{#if report.performance.lab.lcpMs} · main content loads in {fmtMs(report.performance.lab.lcpMs)}{/if}</td></tr>{/if}
              {#if report.cms?.flags.length}{@const r = rollup(report.cms.flags)}<tr><td class="w-status"><Light status={r.light} /></td><td class="w-label"><a href="#cms">{report.cms.platform === 'wordpress' ? 'WordPress' : 'Shopify'} health</a></td><td>{r.text}</td></tr>{/if}
              <tr><td class="w-status"><Light status={report.thirdParties.length > 25 ? 'amber' : 'grey'} label={String(report.thirdParties.length)} /></td><td class="w-label"><a href="#privacy">Third-party services</a></td><td>{report.privacy.find((f) => f.id === 'analytics')?.observed ?? ''}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="panel">
          <header><h2>Key facts</h2></header>
          <table class="kv">
            <tbody>
              {#if report.cms}<tr><td>Platform</td><td>{report.cms.platform === 'wordpress' ? 'WordPress' : 'Shopify'}{#if report.cms.version} {report.cms.version}{/if}{#if report.cms.theme} · theme: {report.cms.theme.name ?? report.cms.theme.slug}{/if}</td></tr>{/if}
              <tr><td>Built with</td><td class="chips">{#each builtWith as t}<a class="pill" href="#tech-{t.slug}">{t.name}</a>{:else}<span class="muted">Nothing identified with confidence</span>{/each}</td></tr>
              <tr><td>Hosting</td><td>{#if report.infra.hosting}{report.infra.hosting.name} <span class="muted small">({confWord[report.infra.hosting.confidence].toLowerCase()})</span>{:else if report.infra.cdn}Hidden behind {report.infra.cdn.name}{:else}Unknown{/if}</td></tr>
              <tr><td>CDN / firewall</td><td>{report.infra.cdn?.name ?? 'None seen'}{#if report.infra.waf && report.infra.waf.name !== report.infra.cdn?.name} · {report.infra.waf.name.replace(/ \(.*\)$/, '')}{/if}</td></tr>
              <tr><td>DNS provider</td><td>{report.infra.dnsProvider?.name ?? '—'}</td></tr>
              <tr><td>Email provider</td><td>{report.infra.emailProvider?.name ?? 'No email set up'}</td></tr>
              {#if report.domain?.created}<tr><td>Domain registered</td><td>{fmtDate(report.domain.created)}{#if report.domain.registrar} with {report.domain.registrar}{/if}</td></tr>{/if}
              {#if report.external.wayback}<tr><td>Online since</td><td>At least {fmtDate(report.external.wayback)}</td></tr>{/if}
              {#if report.cert?.notAfter}{@const d = daysUntil(report.cert.notAfter)}<tr><td>Certificate expires</td><td>{fmtDate(report.cert.notAfter)} <Light status={d !== null && d < 7 ? 'red' : d !== null && d < 21 ? 'amber' : 'green'} label="{d} days" /></td></tr>{/if}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <div class="panel" style="margin-top: 0">
          <header><h2>Screenshot</h2></header>
          <div class="body">
            {#if report.screenshot}
              {#if 'url' in report.screenshot}<img class="screenshot" src={report.screenshot.url} alt="Screenshot of {data.scan.displayHost}" width={report.screenshot.width} height={report.screenshot.height} loading="lazy" />{:else}<img class="screenshot" src={report.screenshot.dataUrl} alt="Screenshot of {data.scan.displayHost}" />{/if}
            {:else}<p class="muted small" style="margin: 0">No screenshot{running ? ' yet' : ''}.</p>{/if}
          </div>
        </div>
        <div class="panel">
          <details style="margin: 0">
            <summary style="padding: 12px 18px; color: var(--text-2); font-weight: 500; font-size: 14px">Scan details</summary>
            <div class="body small" style="padding-top: 0">
              <Stages {stages} {running} />
              <p class="muted" style="margin: 10px 0 0">Scanner {report.scan.scannerVersion}{#if report.scan.fingerprintsVersion} · fingerprints {report.scan.fingerprintsVersion}{/if}</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  </section>

  <section class="report-section" id="technology">
    <h2>Technology</h2>
    <p class="lead">Everything we could identify, and why. "Certain" means several independent signals; "Possible" means one weak signal.</p>
    <div class="panel">
      <header><h2>{report.technologies.length} technologies</h2><input type="search" placeholder="Filter…" bind:value={techFilter} style="max-width: 200px; padding: 6px 10px" aria-label="Filter technologies" /></header>
      <div class="table-wrap">
        <table>
          <thead><tr><th class="w-status">Confidence</th><th class="w-label">Name</th><th>Type</th><th>Version</th><th>Evidence</th></tr></thead>
          <tbody>
            {#each techs as t (t.slug)}
              <tr id="tech-{t.slug}">
                <td class="w-status"><Light status={confLight[t.confidence]} label={confWord[t.confidence]} /></td>
                <td class="w-label">{#if t.website}<a href={t.website} rel="noopener nofollow" target="_blank">{t.name}</a>{:else}{t.name}{/if}</td>
                <td>{typeLabel(t)}</td>
                <td>{t.version ?? '—'}</td>
                <td class="wrap">{#if t.implied}<span class="muted">Implied by {t.evidence[0]?.value.replace('implied by ', '') ?? 'another technology'}</span>{:else}<details><summary>{t.evidence.length} signal{t.evidence.length === 1 ? '' : 's'}</summary><Evidence items={t.evidence} /></details>{/if}</td>
              </tr>
            {:else}
              <tr><td colspan="5" class="muted">Nothing could be identified with confidence. That doesn't mean the site uses no framework — the public response didn't give enough away.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="report-section" id="infrastructure">
    <h2>Hosting &amp; infrastructure</h2>
    <p class="lead">A CDN in front of a site hides where it's really hosted. We only name a host when there's evidence for it.</p>
    <div class="panel">
      <table class="kv">
        <tbody>
          <tr><td>CDN / reverse proxy</td><td>{#if report.infra.cdn}{report.infra.cdn.name}<details><summary>Evidence</summary><Evidence items={report.infra.cdn.evidence} /></details>{:else}None seen{/if}</td></tr>
          <tr><td>Firewall / bot protection</td><td>{#if report.infra.waf}{report.infra.waf.name}{#if report.infra.waf.evidence.length === 1 && report.infra.waf.evidence[0]?.source === 'implied'} <span class="muted small">— {report.infra.waf.evidence[0].value}</span>{:else if report.infra.waf.evidence.length}<details><summary>Evidence</summary><Evidence items={report.infra.waf.evidence} /></details>{/if}{:else}None seen{/if}</td></tr>
          <tr><td>Hosting provider</td><td>{#if report.infra.hosting}{report.infra.hosting.name} <Light status={confLight[report.infra.hosting.confidence]} label={confWord[report.infra.hosting.confidence]} /><details><summary>Evidence</summary><Evidence items={report.infra.hosting.evidence} /></details>{:else if report.infra.cdn}<strong>Not publicly visible.</strong> The site is served through {report.infra.cdn.name}, which hides the real server.{:else}Unknown{/if}</td></tr>
          <tr><td>Web server software</td><td>{serverSoftware}{#if report.http?.poweredBy} · {report.http.poweredBy}{/if}</td></tr>
          <tr><td>Connection</td><td>{report.tls?.alpn === 'h2' ? 'HTTP/2' : (report.tls?.alpn ?? '—')}{#if report.http?.http3} · HTTP/3 available{/if}{#if report.http?.compression} · {report.http.compression} compression{/if}</td></tr>
          {#each report.infra.ips as ip}<tr><td>IP address</td><td class="mono small">{ip.ip}{#if ip.asn} · AS{ip.asn} {ip.asnOrg ?? ''}{/if}{#if ip.country} · {ip.country}{/if}{#if ip.reverseDns} · {ip.reverseDns}{/if}</td></tr>{/each}
          {#if report.external.greenHosting}<tr><td>Green hosting</td><td>{report.external.greenHosting.green ? `Yes — ${report.external.greenHosting.hostedBy ?? 'listed by the Green Web Foundation'}` : 'Not listed by the Green Web Foundation'}</td></tr>{/if}
          {#if report.http?.chain && report.http.chain.length > 1}<tr><td>Redirects</td><td>{#each report.http.chain as hop}<div class="mono small">{hop.status} {hop.url}{#if hop.location} → {hop.location}{/if}</div>{/each}</td></tr>{/if}
          {#if Object.keys(report.http?.cacheHeaders ?? {}).length}<tr><td>Caching</td><td>{#each Object.entries(report.http?.cacheHeaders ?? {}) as [k, v]}<div class="mono small">{k}: {v}</div>{/each}</td></tr>{/if}
        </tbody>
      </table>
    </div>
  </section>

  <section class="report-section" id="domain">
    <h2>Domain &amp; DNS</h2>
    <div class="grid">
      <div class="panel">
        <header><h2>Registration</h2></header>
        {#if report.domain}
          <table class="kv"><tbody>
            <tr><td>Registrar</td><td>{report.domain.registrar ?? 'Not disclosed'}</td></tr>
            <tr><td>Registered</td><td>{fmtDate(report.domain.created)}</td></tr>
            <tr><td>Expires</td><td>{fmtDate(report.domain.expires)}{#if daysUntil(report.domain.expires) !== null}{@const d = daysUntil(report.domain.expires)} <Light status={d! < 30 ? 'red' : d! < 90 ? 'amber' : 'green'} label="{d} days" />{/if}</td></tr>
            <tr><td>Status</td><td class="small">{report.domain.status.join(', ') || '—'}</td></tr>
          </tbody></table>
        {:else}<p class="note">Registration data isn't available for this domain.</p>{/if}
      </div>
      <div class="panel">
        <header><h2>Certificate</h2></header>
        {#if report.cert}
          <table class="kv"><tbody>
            <tr><td>Valid</td><td><Light status={report.tls?.authorized ? 'green' : 'red'} label={report.tls?.authorized ? 'Yes' : 'No'} />{#if !report.tls?.authorized && report.tls?.authorizationError} <span class="muted small">{report.tls.authorizationError}</span>{/if}</td></tr>
            <tr><td>Issued by</td><td>{report.cert.issuer ?? '—'}</td></tr>
            <tr><td>Expires</td><td>{fmtDate(report.cert.notAfter)}</td></tr>
            <tr><td>Encryption</td><td>{report.tls?.protocol ?? '—'}</td></tr>
            {#if report.cert.sans.length}<tr><td>Covers</td><td class="small mono">{report.cert.sans.slice(0, 8).join(', ')}{#if report.cert.sans.length > 8} +{report.cert.sans.length - 8} more{/if}</td></tr>{/if}
          </tbody></table>
        {:else}<p class="note">No certificate information available.</p>{/if}
      </div>
    </div>
    {#if report.dns}
      <div class="panel">
        <header><h2>DNS records</h2></header>
        <div class="table-wrap">
          <table>
            <thead><tr><th style="width: 90px">Type</th><th>Value</th></tr></thead>
            <tbody>
              {#each report.dns.A as v}<tr><td>A</td><td class="mono">{v}</td></tr>{/each}
              {#each report.dns.AAAA as v}<tr><td>AAAA</td><td class="mono">{v}</td></tr>{/each}
              {#each report.dns.CNAME as v}<tr><td>CNAME</td><td class="mono">{v}</td></tr>{/each}
              {#each report.dns.NS as v}<tr><td>NS</td><td class="mono">{v}</td></tr>{/each}
              {#each report.dns.MX as v}<tr><td>MX</td><td class="mono">{v.priority} {v.exchange}</td></tr>{/each}
              {#each report.dns.TXT as v}<tr><td>TXT</td><td class="mono small wrap">{v}</td></tr>{/each}
              {#each report.dns.CAA as v}<tr><td>CAA</td><td class="mono">{v}</td></tr>{/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  </section>

  <section class="report-section" id="security">
    <h2>Security setup</h2>
    <p class="lead">What the site's public configuration shows. "Check" items are hardening opportunities, not proof of a vulnerability.</p>
    <div class="panel"><FindingsTable findings={report.security} empty="No page response to assess." /></div>
    {#if report.cookies.length}
      <div class="panel">
        <header><h2>Cookies set on arrival ({report.cookies.length})</h2></header>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Set by</th><th>Secure</th><th>HttpOnly</th><th>SameSite</th><th>Lasts</th></tr></thead>
            <tbody>{#each report.cookies as c}<tr><td class="mono">{c.name}</td><td class="mono small">{c.domain}{c.thirdParty ? ' (third party)' : ''}</td><td>{c.secure ? '✓' : '—'}</td><td>{c.httpOnly ? '✓' : '—'}</td><td>{c.sameSite ?? '—'}</td><td>{c.session ? 'this visit' : 'persists'}</td></tr>{/each}</tbody>
          </table>
        </div>
      </div>
    {/if}
  </section>

  <section class="report-section" id="email">
    <h2>Email protection</h2>
    <p class="lead">Whether others can send email pretending to be this domain.</p>
    <div class="panel"><FindingsTable findings={report.email} /></div>
  </section>

  <section class="report-section" id="seo">
    <h2>SEO</h2>
    {#if report.seo}
      <div class="panel"><FindingsTable findings={report.seo.findings} /></div>
      <div class="grid">
        <div class="panel">
          <header><h2>Page details</h2></header>
          <table class="kv"><tbody>
            <tr><td>Title</td><td>{report.seo.title ?? '—'}</td></tr>
            <tr><td>Description</td><td class="small">{report.seo.metaDescription ?? '—'}</td></tr>
            <tr><td>Language</td><td>{report.seo.lang ?? '—'}</td></tr>
            <tr><td>Headings</td><td class="small">{Object.entries(report.seo.headingCounts).filter(([, v]) => v).map(([k, v]) => `${k.toUpperCase()}: ${v}`).join(' · ') || '—'}</td></tr>
            <tr><td>Links</td><td class="small">{report.seo.links.internal} internal · {report.seo.links.external} external</td></tr>
            <tr><td>Images without alt text</td><td>{report.seo.images.missingAlt} of {report.seo.images.total}</td></tr>
            {#if report.seo.structuredData.types.length}<tr><td>Structured data</td><td class="small">{report.seo.structuredData.types.join(', ')}</td></tr>{/if}
            {#if report.seo.openGraph['og:image']}<tr><td>Social preview image</td><td class="small mono wrap">{report.seo.openGraph['og:image']}</td></tr>{/if}
          </tbody></table>
        </div>
        {#if report.robots}
          <div class="panel">
            <header><h2>Crawler rules</h2></header>
            <table class="kv"><tbody>
              <tr><td>robots.txt</td><td>{report.robots.present ? (report.robots.disallowAll ? 'Blocks all crawlers' : 'Present') : 'Not found'}</td></tr>
              <tr><td>Sitemap</td><td class="small mono wrap">{report.robots.sitemaps[0] ?? (report.wellKnown ? '—' : '—')}</td></tr>
              <tr><td>AI crawlers</td><td class="chips">{#each report.robots.aiCrawlers as a}<span class="pill {a.blocked ? 'amber' : ''}">{a.agent}: {a.blocked ? 'blocked' : 'allowed'}</span>{/each}</td></tr>
              <tr><td>security.txt</td><td>{report.wellKnown.securityTxt ? 'Present' : 'Not found'}</td></tr>
              <tr><td>ads.txt / llms.txt</td><td>{report.wellKnown.adsTxt ? 'ads.txt ' : ''}{report.wellKnown.llmsTxt ? 'llms.txt' : ''}{!report.wellKnown.adsTxt && !report.wellKnown.llmsTxt ? 'Not found' : ''}</td></tr>
            </tbody></table>
          </div>
        {/if}
      </div>
    {:else}<div class="panel"><p class="note">No page to assess.</p></div>{/if}
  </section>

  <section class="report-section" id="performance">
    <h2>Performance</h2>
    {#if report.performance}
      {@const p = report.performance}
      <div class="panel">
        <header><h2>Lighthouse scores (mobile)</h2><span class="hint">via Google PageSpeed Insights, {fmtDate(p.fetchedAt)}</span></header>
        <table>
          <thead><tr><th class="w-status">Score</th><th class="w-label">Category</th><th>What it means</th></tr></thead>
          <tbody>
            {#each [['Performance', p.scores.performance, 'How fast the page loads and responds'], ['Accessibility', p.scores.accessibility, 'Automated checks only — not a full audit'], ['Best practices', p.scores.bestPractices, 'Modern web standards and safety'], ['SEO', p.scores.seo, 'Basic search-engine readiness']] as [label, v, why]}
              <tr><td class="w-status"><Light status={scoreLight(v as number | null)} label={String(v ?? '—')} /></td><td class="w-label">{label}</td><td>{why}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="panel">
        <header><h2>Speed metrics</h2><span class="hint">Lab = simulated; Real users = Chrome data over 28 days</span></header>
        <table>
          <thead><tr><th class="w-label">Metric</th><th>Lab</th><th>Real users</th><th>Good is</th></tr></thead>
          <tbody>
            <tr><td class="w-label">Main content visible (LCP)</td><td>{fmtMs(p.lab.lcpMs)}</td><td>{fmtMs(p.field?.lcpMs)}</td><td class="muted">under 2.5 s</td></tr>
            <tr><td class="w-label">Layout stability (CLS)</td><td>{p.lab.cls?.toFixed(2) ?? '—'}</td><td>{p.field?.cls?.toFixed(2) ?? '—'}</td><td class="muted">under 0.1</td></tr>
            <tr><td class="w-label">Responsiveness (TBT / INP)</td><td>{fmtMs(p.lab.tbtMs)}</td><td>{fmtMs(p.field?.inpMs)}</td><td class="muted">under 200 ms</td></tr>
            <tr><td class="w-label">First paint (FCP)</td><td>{fmtMs(p.lab.fcpMs)}</td><td>—</td><td class="muted">under 1.8 s</td></tr>
            <tr><td class="w-label">Page weight</td><td>{fmtBytes(p.totalBytes)} · {p.requestCount ?? '—'} requests</td><td>—</td><td class="muted">smaller is better</td></tr>
          </tbody>
        </table>
        {#if p.accessibilityIssues.length}<p class="note">Accessibility issues found: {p.accessibilityIssues.map((a) => a.title).join('; ')}.</p>{/if}
      </div>
    {:else}<div class="panel"><p class="note">Performance data not available{running ? ' yet' : ''}.</p></div>{/if}
  </section>

  <section class="report-section" id="privacy">
    <h2>Privacy &amp; third parties</h2>
    <div class="panel"><FindingsTable findings={report.privacy} /></div>
    {#if report.thirdParties.length}
      <div class="panel">
        <header><h2>Third-party services ({report.thirdParties.length})</h2></header>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Service</th><th>Purpose</th><th>Domain</th><th>Requests</th></tr></thead>
            <tbody>{#each report.thirdParties as t}<tr><td>{t.technology ?? '—'}</td><td class="muted">{t.category ?? '—'}</td><td class="mono small">{t.domain}</td><td>{t.count}</td></tr>{/each}</tbody>
          </table>
        </div>
      </div>
    {/if}
  </section>

  {#if report.cms}
    <section class="report-section" id="cms">
      <h2>{report.cms.platform === 'wordpress' ? 'WordPress' : 'Shopify'}</h2>
      {#if report.cms.flags.length}<div class="panel"><FindingsTable findings={report.cms.flags} /></div>{/if}
      <div class="panel">
        <header><h2>{report.cms.platform === 'wordpress' ? 'Plugins' : 'Apps'} ({report.cms.plugins.length})</h2><span class="hint">Only those visible from the homepage</span></header>
        <table class="kv"><tbody>
          {#if report.cms.version}<tr><td>Version</td><td>{report.cms.version}</td></tr>{/if}
          {#if report.cms.theme}<tr><td>Theme</td><td>{report.cms.theme.name ?? report.cms.theme.slug}{#if report.cms.theme.version} {report.cms.theme.version}{/if}{#if report.cms.theme.author} · by {report.cms.theme.author}{/if}</td></tr>{/if}
        </tbody></table>
        {#if report.cms.plugins.length}
          <div class="table-wrap"><table><thead><tr><th>Name</th><th>Version</th><th>Slug</th></tr></thead><tbody>{#each report.cms.plugins as p}<tr><td>{p.name ?? '—'}</td><td>{p.version ?? '—'}</td><td class="mono small">{p.slug}</td></tr>{/each}</tbody></table></div>
        {/if}
      </div>
    </section>
  {/if}
{/if}
