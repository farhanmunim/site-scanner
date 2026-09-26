<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import type { Finding, IpInfo, Report, StageMeta, StageName, TechnologyDetection } from '@site-scanner/core/types';
  import Stages from '$lib/components/Stages.svelte';
  import Light from '$lib/components/Light.svelte';
  import FindingsTable from '$lib/components/FindingsTable.svelte';
  import { ago, daysUntil, fmtBytes, fmtDate, fmtMs } from '$lib/format';

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

  // ---- presentation helpers (kept in script so text joins are explicit) ----
  const statusText: Record<string, string> = { complete: 'Complete', partial: 'Partly complete', restricted: 'Limited — site blocks bots', failed: 'Failed', queued: 'Queued', running: 'Scanning' };
  const confLight = { high: 'green', medium: 'amber', low: 'grey' } as const;
  const confWord = { high: 'Certain', medium: 'Likely', low: 'Possible' } as const;
  const dot = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');

  function rollup(fs: Finding[] | undefined): { light: 'green' | 'amber' | 'red' | 'grey'; text: string } {
    if (!fs || !fs.length) return { light: 'grey', text: 'Not checked' };
    const bad = fs.filter((f) => f.status === 'bad').length;
    const warn = fs.filter((f) => f.status === 'warn').length;
    if (bad) return { light: 'red', text: `${bad} thing${bad > 1 ? 's' : ''} to fix${warn ? `, ${warn} to check` : ''}` };
    if (warn) return { light: 'amber', text: `${warn} thing${warn > 1 ? 's' : ''} worth checking` };
    return { light: 'green', text: 'Nothing to fix' };
  }
  const scoreLight = (n: number | null) => (n === null ? 'grey' : n >= 90 ? 'green' : n >= 50 ? 'amber' : 'red');

  /** Categories that are infrastructure or metadata rather than "what the site is built with". */
  const notBuiltWith = /^(Webmail|Hosting|CDN|Miscellaneous|Email|Security|PaaS|IaaS|Reverse proxies|Load balancers|SSL\/TLS certificate authorities|Domain parking|Web servers)$/;
  const typeLabel = (t: TechnologyDetection) => (/ DNS$/.test(t.name) ? 'DNS provider' : t.categories.map((c) => c.name).join(', '));
  const ipLine = (ip: IpInfo) => dot(ip.ip, ip.asn ? `AS${ip.asn}${ip.asnOrg ? ` ${ip.asnOrg}` : ''}` : null, ip.country, ip.reverseDns);

  let techFilter = $state('');
  let techs = $derived((report?.technologies ?? []).filter((t) => !techFilter || t.name.toLowerCase().includes(techFilter.toLowerCase()) || t.categories.some((c) => c.name.toLowerCase().includes(techFilter.toLowerCase()))));
  let anyVersion = $derived((report?.technologies ?? []).some((t) => t.version));
  let builtWith = $derived((report?.technologies ?? []).filter((t) => !t.implied && t.confidence !== 'low' && !t.categories.every((c) => notBuiltWith.test(c.name))).slice(0, 14));
  let platformName = $derived(report?.cms ? (report.cms.platform === 'wordpress' ? 'WordPress' : 'Shopify') : '');
  let platformLine = $derived(report?.cms ? dot(`${platformName}${report.cms.version ? ` ${report.cms.version}` : ''}`, report.cms.theme ? `theme: ${report.cms.theme.name ?? report.cms.theme.slug}` : null) : '');
  let themeLine = $derived(report?.cms?.theme ? dot(`${report.cms.theme.name ?? report.cms.theme.slug}${report.cms.theme.version ? ` ${report.cms.theme.version}` : ''}`, report.cms.theme.author ? `by ${report.cms.theme.author}` : null) : '');
  let cdnLine = $derived(report ? dot(report.infra.cdn?.name ?? 'None seen', report.infra.waf && report.infra.waf.name !== report.infra.cdn?.name ? report.infra.waf.name : null) : '');
  let connectionLine = $derived(report ? dot(report.tls?.alpn === 'h2' ? 'HTTP/2' : (report.tls?.alpn ?? null), report.http?.http3 ? 'HTTP/3 available' : null, report.http?.compression ? `${report.http.compression} compression` : null) || '—' : '');
  let serverLine = $derived.by(() => {
    if (!report) return '';
    const s = report.http?.server;
    let base = 'Not disclosed';
    if (s) base = report.infra.cdn && new RegExp(report.infra.cdn.name.split(' ')[0]!, 'i').test(s) ? `Not disclosed (behind ${report.infra.cdn.name})` : s;
    return dot(base, report.http?.poweredBy);
  });
  let nav = $derived([
    ['overview', 'Overview'],
    ['technology', 'Technology'],
    ['infrastructure', 'Hosting'],
    ['domain', 'Domain & DNS'],
    ['security', 'Security'],
    ['email', 'Email'],
    ['seo', 'SEO'],
    ['performance', 'Performance'],
    ['privacy', 'Privacy'],
    ...(report?.cms ? [['cms', platformName]] : [])
  ]);

  let pdfState = $state<'idle' | 'preparing' | 'error'>('idle');
  async function downloadPdf() {
    if (pdfState === 'preparing') return;
    pdfState = 'preparing';
    const url = `/r/${data.scan.id}/pdf`;
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(url, { headers: { accept: 'application/json' } });
        const j = (await r.json()) as { status: string };
        if (j.status === 'ready') {
          pdfState = 'idle';
          window.location.assign(url); // served as an attachment, so the page stays put
          return;
        }
        if (j.status !== 'pending') break;
      } catch {
        break;
      }
      await new Promise((res) => setTimeout(res, 2000));
    }
    pdfState = 'error';
  }
</script>

<svelte:head>
  <title>{data.scan.displayHost} — website report</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if data.notice}<p class="alert" role="status">{data.notice}</p>{/if}

<div class="report-head">
  <div>
    <p class="print-only muted small eyebrow">Website report · {fmtDate(data.scan.createdAt)} · site-scan.farhan.app</p>
    <h1><a href={report?.http?.finalUrl ?? data.scan.url} rel="noopener nofollow" target="_blank" class="plain">{data.scan.displayHost}</a></h1>
    <div class="meta">
      <span class="pill {status === 'complete' ? 'green' : status === 'failed' ? 'red' : running ? 'blue' : 'amber'}">{statusText[status] ?? status}</span>
      <span>{data.scan.durationMs ? `Scanned ${ago(data.scan.createdAt)} in ${fmtMs(data.scan.durationMs)}` : `Started ${ago(data.scan.createdAt)}`}</span>
    </div>
  </div>
  <div class="row actions">
    {#if !running}<button class="secondary" type="button" onclick={downloadPdf} disabled={pdfState === 'preparing'} aria-live="polite">{pdfState === 'preparing' ? 'Preparing PDF…' : pdfState === 'error' ? 'PDF failed — retry' : 'Download PDF'}</button>{/if}
    <a class="button secondary" href="/api/scans/{data.scan.id}" rel="nofollow">JSON</a>
    <a class="button secondary" href="/?url={encodeURIComponent(data.scan.url)}" title="Runs a fresh scan if the cached result is older than 15 minutes">Scan again</a>
  </div>
</div>

{#if running || !report}
  <div class="panel">
    <header><h2>{#if running}<span class="ellipsis">Scanning</span>{:else}No results{/if}</h2>{#if running}<span class="hint">Usually 10–40 seconds</span>{/if}</header>
    {#if running}<div class="progress" role="progressbar" aria-label="Scan in progress"></div>{/if}
    <div class="body">
      <Stages {stages} {running} />
      {#if scanError}<p class="alert red" style="margin: 12px 0 0">{scanError}</p>{/if}
    </div>
  </div>
{/if}

{#if report}
  <nav class="report-nav" aria-label="Report sections">
    {#each nav as [id, label]}<a href="#{id}">{label}</a>{/each}
  </nav>

  {#if report.safeBrowsing?.threats.length}
    <p class="alert red" role="alert"><strong>Google Safe Browsing flags this site</strong> ({report.safeBrowsing.threats.join(', ').toLowerCase()}). Visit with care.</p>
  {/if}
  {#if report.http?.challenge || report.scan.quality === 'restricted'}
    <p class="alert amber">This website blocks automated visitors{report.http?.challenge ? ` (${report.http.challenge.vendor})` : ''}, so page-based checks are limited. Domain, DNS and certificate information was still collected.</p>
  {/if}

  <!-- ============ Overview ============ -->
  <section class="report-section" id="overview">
    <div class="overview">
      <div class="stack">
        <div class="panel glance">
          <header><h2>At a glance</h2></header>
          <table>
            <tbody>
              <tr><td class="w-status"><Light status={report.http?.status && report.http.status < 400 ? 'green' : 'red'} label={report.http?.status ? `HTTP ${report.http.status}` : 'No response'} /></td><td class="w-label">Site reachable</td><td class="wrap mono small">{report.http?.finalUrl ?? '—'}</td></tr>
              {#if report.security.length}{@const r = rollup(report.security)}<tr><td class="w-status"><Light status={r.light} /></td><td class="w-label"><a href="#security">Security setup</a></td><td>{r.text}</td></tr>{/if}
              {#if report.email.length}{@const r = rollup(report.email)}<tr><td class="w-status"><Light status={r.light} /></td><td class="w-label"><a href="#email">Email protection</a></td><td>{r.text}</td></tr>{/if}
              {#if report.seo}{@const r = rollup(report.seo.findings)}<tr><td class="w-status"><Light status={r.light} /></td><td class="w-label"><a href="#seo">SEO basics</a></td><td>{r.text}</td></tr>{/if}
              {#if report.performance}<tr><td class="w-status"><Light status={scoreLight(report.performance.scores.performance)} label={String(report.performance.scores.performance ?? '—')} /></td><td class="w-label"><a href="#performance">Performance score</a></td><td>{dot('Lighthouse, mobile', report.performance.lab.lcpMs ? `main content loads in ${fmtMs(report.performance.lab.lcpMs)}` : null)}</td></tr>{/if}
              {#if report.cms?.flags.length}{@const r = rollup(report.cms.flags)}<tr><td class="w-status"><Light status={r.light} /></td><td class="w-label"><a href="#cms">{platformName} health</a></td><td>{r.text}</td></tr>{/if}
              <tr><td class="w-status"><Light status={report.thirdParties.length > 25 ? 'amber' : 'grey'} label={String(report.thirdParties.length)} /></td><td class="w-label"><a href="#privacy">Third-party services</a></td><td>{report.privacy.find((f) => f.id === 'analytics')?.observed ?? ''}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="panel facts">
          <header><h2>Key facts</h2></header>
          <table class="kv">
            <tbody>
              {#if report.cms}<tr><td>Platform</td><td>{platformLine}</td></tr>{/if}
              <tr><td>Built with</td><td class="chips">{#each builtWith as t}<a class="pill" href="#tech-{t.slug}">{t.name}</a>{:else}<span class="muted">Nothing identified with confidence</span>{/each}</td></tr>
              <tr><td>Hosting</td><td>{#if report.infra.hosting}{report.infra.hosting.name} <span class="muted small">({confWord[report.infra.hosting.confidence].toLowerCase()})</span>{:else if report.infra.cdn}Hidden behind {report.infra.cdn.name}{:else}Unknown{/if}</td></tr>
              <tr><td>CDN / firewall</td><td>{cdnLine}</td></tr>
              <tr><td>DNS provider</td><td>{report.infra.dnsProvider?.name ?? '—'}</td></tr>
              <tr><td>Email provider</td><td>{report.infra.emailProvider?.name ?? 'No email set up'}</td></tr>
              {#if report.domain?.created}<tr><td>Domain registered</td><td>{dot(fmtDate(report.domain.created), report.domain.registrar ? `with ${report.domain.registrar}` : null)}</td></tr>{/if}
              {#if report.external.wayback}<tr><td>Online since</td><td>At least {fmtDate(report.external.wayback)}</td></tr>{/if}
              {#if report.cert?.notAfter}{@const d = daysUntil(report.cert.notAfter)}<tr><td>Certificate expires</td><td class="row-inline">{fmtDate(report.cert.notAfter)} <Light status={d !== null && d < 7 ? 'red' : d !== null && d < 21 ? 'amber' : 'green'} label="{d} days" /></td></tr>{/if}
            </tbody>
          </table>
        </div>
      </div>
      <div class="stack">
        <div class="panel shot-panel">
          <header><h2>Screenshot</h2><span class="hint no-print">Desktop, above the fold</span></header>
          <div class="body">
            {#if report.screenshot}
              {#if 'url' in report.screenshot}<a class="shot" href={report.screenshot.url} target="_blank" rel="noopener" title="Open full screenshot"><img src={report.screenshot.url} alt="Screenshot of {data.scan.displayHost}" width={report.screenshot.width} height={report.screenshot.height} loading="lazy" /></a>{:else}<div class="shot"><img src={report.screenshot.dataUrl} alt="Screenshot of {data.scan.displayHost}" /></div>{/if}
            {:else}<p class="muted small" style="margin: 0">No screenshot{running ? ' yet' : ''}.</p>{/if}
          </div>
        </div>
        <details class="panel disclosure no-print">
          <summary>Scan details</summary>
          <div class="body small">
            <Stages {stages} {running} />
            <p class="muted" style="margin: 10px 0 0">{dot(`Scanner ${report.scan.scannerVersion}`, report.scan.fingerprintsVersion ? `fingerprints ${report.scan.fingerprintsVersion}` : null)}</p>
          </div>
        </details>
      </div>
    </div>
  </section>

  <!-- ============ Technology ============ -->
  <section class="report-section" id="technology">
    <h2>Technology</h2>
    <p class="lead">Everything we could identify. "Certain" means several independent signals agree; "Possible" means a single weak one.</p>
    <div class="panel">
      <header><h2>{report.technologies.length} technologies</h2><input type="search" class="filter" placeholder="Filter…" bind:value={techFilter} aria-label="Filter technologies" /></header>
      <div class="table-wrap">
        <table class="tech">
          <thead><tr><th class="w-status">Confidence</th><th class="w-label">Name</th><th>Type</th>{#if anyVersion}<th>Version</th>{/if}</tr></thead>
          <tbody>
            {#each techs as t (t.slug)}
              <tr id="tech-{t.slug}">
                <td class="w-status"><Light status={confLight[t.confidence]} label={confWord[t.confidence]} /></td>
                <td class="w-label">{#if t.website}<a href={t.website} rel="noopener nofollow" target="_blank">{t.name}</a>{:else}{t.name}{/if}</td>
                <td class="type">{typeLabel(t)}</td>
                {#if anyVersion}<td class="version">{t.version ?? '—'}</td>{/if}
              </tr>
            {:else}
              <tr><td colspan="4" class="muted">Nothing could be identified with confidence. That doesn't mean the site uses no framework — the public response didn't give enough away.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- ============ Hosting ============ -->
  <section class="report-section" id="infrastructure">
    <h2>Hosting &amp; infrastructure</h2>
    <p class="lead">A CDN in front of a site hides where it's really hosted. We only name a host when there's evidence for it.</p>
    <div class="panel">
      <table class="kv">
        <tbody>
          <tr><td>CDN / reverse proxy</td><td>{report.infra.cdn?.name ?? 'None seen'}</td></tr>
          <tr><td>Firewall / bot protection</td><td>{#if report.infra.waf}{report.infra.waf.name}{#if report.infra.waf.evidence.length === 1 && report.infra.waf.evidence[0]?.source === 'implied'}<div class="muted small">{report.infra.waf.evidence[0].value}</div>{/if}{:else}None seen{/if}</td></tr>
          <tr><td>Hosting provider</td><td>{#if report.infra.hosting}<span class="row-inline">{report.infra.hosting.name} <Light status={confLight[report.infra.hosting.confidence]} label={confWord[report.infra.hosting.confidence]} /></span>{:else if report.infra.cdn}<strong>Not publicly visible.</strong> The site is served through {report.infra.cdn.name}, which hides the real server.{:else}Unknown{/if}</td></tr>
          <tr><td>Web server software</td><td>{serverLine}</td></tr>
          <tr><td>Connection</td><td>{connectionLine}</td></tr>
          {#each report.infra.ips as ip}<tr><td>IP address</td><td class="mono small">{ipLine(ip)}</td></tr>{/each}
          {#if report.external.greenHosting}<tr><td>Green hosting</td><td>{report.external.greenHosting.green ? `Yes — ${report.external.greenHosting.hostedBy ?? 'listed by the Green Web Foundation'}` : 'Not listed by the Green Web Foundation'}</td></tr>{/if}
          {#if report.http?.chain && report.http.chain.length > 1}<tr><td>Redirects</td><td>{#each report.http.chain as hop}<div class="mono small">{hop.location ? `${hop.status} ${hop.url} → ${hop.location}` : `${hop.status} ${hop.url}`}</div>{/each}</td></tr>{/if}
          {#if Object.keys(report.http?.cacheHeaders ?? {}).length}<tr><td>Caching</td><td>{#each Object.entries(report.http?.cacheHeaders ?? {}) as [k, v]}<div class="mono small">{k}: {v}</div>{/each}</td></tr>{/if}
        </tbody>
      </table>
    </div>
  </section>

  <!-- ============ Domain & DNS ============ -->
  <section class="report-section" id="domain">
    <h2>Domain &amp; DNS</h2>
    <div class="grid">
      <div class="panel">
        <header><h2>Registration</h2></header>
        {#if report.domain}
          <table class="kv"><tbody>
            <tr><td>Registrar</td><td>{report.domain.registrar ?? 'Not disclosed'}</td></tr>
            <tr><td>Registered</td><td>{fmtDate(report.domain.created)}</td></tr>
            <tr><td>Expires</td><td class="row-inline">{fmtDate(report.domain.expires)}{#if daysUntil(report.domain.expires) !== null}{@const d = daysUntil(report.domain.expires)}&nbsp;<Light status={d! < 30 ? 'red' : d! < 90 ? 'amber' : 'green'} label="{d} days" />{/if}</td></tr>
            <tr><td>Status</td><td class="small">{report.domain.status.join(', ') || '—'}</td></tr>
          </tbody></table>
        {:else}<p class="note">Registration data isn't available for this domain.</p>{/if}
      </div>
      <div class="panel">
        <header><h2>Certificate</h2></header>
        {#if report.cert}
          <table class="kv"><tbody>
            <tr><td>Valid</td><td class="row-inline"><Light status={report.tls?.authorized ? 'green' : 'red'} label={report.tls?.authorized ? 'Yes' : 'No'} />{#if !report.tls?.authorized && report.tls?.authorizationError}<span class="muted small">{report.tls.authorizationError}</span>{/if}</td></tr>
            <tr><td>Issued by</td><td>{report.cert.issuer ?? '—'}</td></tr>
            <tr><td>Expires</td><td>{fmtDate(report.cert.notAfter)}</td></tr>
            <tr><td>Encryption</td><td>{report.tls?.protocol ?? '—'}</td></tr>
            {#if report.cert.sans.length}<tr><td>Covers</td><td class="small mono wrap">{report.cert.sans.slice(0, 8).join(', ')}{report.cert.sans.length > 8 ? ` +${report.cert.sans.length - 8} more` : ''}</td></tr>{/if}
          </tbody></table>
        {:else}<p class="note">No certificate information available.</p>{/if}
      </div>
    </div>
    {#if report.dns}
      <div class="panel">
        <header><h2>DNS records</h2></header>
        <table class="dns">
          <thead><tr><th class="w-type">Type</th><th>Value</th></tr></thead>
          <tbody>
            {#each report.dns.A as v}<tr><td>A</td><td class="mono wrap">{v}</td></tr>{/each}
            {#each report.dns.AAAA as v}<tr><td>AAAA</td><td class="mono wrap">{v}</td></tr>{/each}
            {#each report.dns.CNAME as v}<tr><td>CNAME</td><td class="mono wrap">{v}</td></tr>{/each}
            {#each report.dns.NS as v}<tr><td>NS</td><td class="mono wrap">{v}</td></tr>{/each}
            {#each report.dns.MX as v}<tr><td>MX</td><td class="mono wrap">{v.priority} {v.exchange}</td></tr>{/each}
            {#each report.dns.TXT as v}<tr><td>TXT</td><td class="mono small wrap">{v}</td></tr>{/each}
            {#each report.dns.CAA as v}<tr><td>CAA</td><td class="mono wrap">{v}</td></tr>{/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <!-- ============ Security ============ -->
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
            <tbody>{#each report.cookies as c}<tr><td class="mono">{c.name}</td><td class="mono small">{c.domain}{c.thirdParty ? ' (third party)' : ''}</td><td>{c.secure ? 'Yes' : 'No'}</td><td>{c.httpOnly ? 'Yes' : 'No'}</td><td>{c.sameSite ?? '—'}</td><td>{c.session ? 'This visit' : 'Persists'}</td></tr>{/each}</tbody>
          </table>
        </div>
      </div>
    {/if}
  </section>

  <!-- ============ Email ============ -->
  <section class="report-section" id="email">
    <h2>Email protection</h2>
    <p class="lead">Whether others can send email pretending to be this domain.</p>
    <div class="panel"><FindingsTable findings={report.email} /></div>
  </section>

  <!-- ============ SEO ============ -->
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
              <tr><td>Sitemap</td><td class="small mono wrap">{report.robots.sitemaps[0] ?? '—'}</td></tr>
              <tr><td>AI crawlers</td><td>{#if report.robots.aiCrawlers.some((a) => a.blocked)}Blocked: {report.robots.aiCrawlers.filter((a) => a.blocked).map((a) => a.agent).join(', ')}{:else}All allowed (no AI-specific rules){/if}</td></tr>
              <tr><td>security.txt</td><td>{report.wellKnown.securityTxt ? 'Present' : 'Not found'}</td></tr>
              <tr><td>ads.txt / llms.txt</td><td>{[report.wellKnown.adsTxt && 'ads.txt', report.wellKnown.llmsTxt && 'llms.txt'].filter(Boolean).join(', ') || 'Not found'}</td></tr>
            </tbody></table>
          </div>
        {/if}
      </div>
    {:else}<div class="panel"><p class="note">No page to assess.</p></div>{/if}
  </section>

  <!-- ============ Performance ============ -->
  <section class="report-section" id="performance">
    <h2>Performance</h2>
    {#if report.performance}
      {@const p = report.performance}
      <div class="panel">
        <header><h2>Lighthouse scores (mobile)</h2><span class="hint">Google PageSpeed Insights, {fmtDate(p.fetchedAt)}</span></header>
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
        <header><h2>Speed metrics</h2><span class="hint">Lab = simulated; Real users = Chrome data, 28 days</span></header>
        <div class="table-wrap">
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
        </div>
        {#if p.accessibilityIssues.length}<p class="note">Accessibility issues found: {p.accessibilityIssues.map((a) => a.title).join('; ')}.</p>{/if}
      </div>
    {:else}<div class="panel"><p class="note">Performance data not available{running ? ' yet' : ''}.</p></div>{/if}
  </section>

  <!-- ============ Privacy ============ -->
  <section class="report-section" id="privacy">
    <h2>Privacy &amp; third parties</h2>
    <div class="panel"><FindingsTable findings={report.privacy} /></div>
    {#if report.thirdParties.length}
      <div class="panel">
        <header><h2>Third-party services ({report.thirdParties.length})</h2></header>
        <div class="table-wrap">
          <table class="tp">
            <thead><tr><th>Service</th><th>Purpose</th><th>Domain</th><th class="w-num">Requests</th></tr></thead>
            <tbody>{#each report.thirdParties as t}<tr><td>{t.technology ?? `Unknown (${t.domain.split('.').slice(-2).join('.')})`}</td><td class="muted">{t.category ?? '—'}</td><td class="mono small wrap">{t.domain}</td><td>{t.count}</td></tr>{/each}</tbody>
          </table>
        </div>
      </div>
    {/if}
  </section>

  <!-- ============ CMS ============ -->
  {#if report.cms}
    <section class="report-section" id="cms">
      <h2>{platformName}</h2>
      {#if report.cms.flags.length}<div class="panel"><FindingsTable findings={report.cms.flags} /></div>{/if}
      <div class="panel">
        <header><h2>{report.cms.platform === 'wordpress' ? 'Theme and plugins' : 'Theme and apps'}</h2><span class="hint">Only what's visible from the homepage</span></header>
        {#if report.cms.version || report.cms.theme}
          <table class="kv"><tbody>
            {#if report.cms.version}<tr><td>Version</td><td>{report.cms.version}</td></tr>{/if}
            {#if report.cms.theme}<tr><td>Theme</td><td>{themeLine}</td></tr>{/if}
          </tbody></table>
        {:else if !report.cms.plugins.length}
          <p class="note" style="border-top: 0">The site runs {platformName}, but it doesn't reveal its version, theme or {report.cms.platform === 'wordpress' ? 'plugins' : 'apps'} from the homepage. That's normal for a hardened or heavily customised setup.</p>
        {/if}
        {#if report.cms.plugins.length}
          <div class="table-wrap"><table><thead><tr><th>{report.cms.platform === 'wordpress' ? 'Plugin' : 'App'}</th><th>Version</th><th>Slug</th></tr></thead><tbody>{#each report.cms.plugins as p}<tr><td>{p.name ?? '—'}</td><td>{p.version ?? '—'}</td><td class="mono small">{p.slug}</td></tr>{/each}</tbody></table></div>
        {/if}
      </div>
    </section>
  {/if}

  <!-- ============ Next action ============ -->
  <section class="report-section scan-another no-print" aria-label="Scan another website">
    <h2>Scan another website</h2>
    <form class="scan-form" method="GET" action="/">
      <label class="sr-only" for="another">Website address</label>
      <input id="another" name="url" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="example.com" required />
      <button class="primary" type="submit">Continue</button>
    </form>
  </section>
{/if}
