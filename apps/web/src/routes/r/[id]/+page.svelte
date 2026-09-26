<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import type { Finding, IpInfo, Report, StageMeta, StageName, TechnologyDetection, CertChainEntry } from '@site-scanner/core/types';
  import { CWV_THRESHOLDS, cwvVerdict, scoreTone, vitals } from '@site-scanner/core/analyze/score';
  import Badge from '$lib/components/Badge.svelte';
  import FindingsTable from '$lib/components/FindingsTable.svelte';
  import ScanLog from '$lib/components/ScanLog.svelte';
  import { subscribeScan, TERMINAL } from '$lib/scan-events';
  import { daysUntil, fmtBytes, fmtDate, fmtMs } from '$lib/format';

  let { data } = $props();
  let printMode = $derived(page.url.searchParams.get('print') === '1');
  let status = $state<string>(data.scan.status);
  let stages = $state<Partial<Record<StageName, StageMeta>>>(data.scan.stages ?? {});
  let report = $state<Report | null>(data.scan.report ?? null);
  let scanError = $state<string | null>(data.scan.error ?? null);
  let durationMs = $state<number | null>(data.scan.durationMs ?? null);
  let running = $derived(!TERMINAL.has(status));

  onMount(() => {
    if (printMode) {
      document.documentElement.setAttribute('data-theme', 'light');
      document.body.classList.add('print-mode');
      for (const d of document.querySelectorAll('details')) d.open = true;
    }
    if (!running) return;
    return subscribeScan(data.scan.id, (u) => {
      status = u.status;
      if (u.stages) stages = u.stages;
      if (u.report) report = u.report;
      scanError = u.error ?? null;
      if (TERMINAL.has(u.status)) void fetch(`/api/scans/${data.scan.id}`).then((r) => r.json()).then((j: { durationMs?: number | null; report?: Report | null }) => { durationMs = j.durationMs ?? null; if (j.report) report = j.report; }).catch(() => {});
    });
  });

  // ---------- helpers ----------
  const dot = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');
  const initials = (name: string) => name.split(/[\s.-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || name.slice(0, 2).toUpperCase();
  const toneClass = { green: 'g', amber: 'a', red: 'r', grey: 'n' } as const;
  const confWord = { high: 'Certain', medium: 'Likely', low: 'Possible' } as const;
  const confBadge = { high: 'pass', medium: 'warn', low: 'neutral' } as const;
  const statusText: Record<string, string> = { complete: 'Complete', partial: 'Partly complete', restricted: 'Limited: site blocks bots', failed: 'Failed', queued: 'Queued', running: 'Scanning' };
  const HEADER_CODES: Record<string, string> = {
    hsts: 'Strict-Transport-Security',
    csp: 'Content-Security-Policy',
    xcto: 'X-Content-Type-Options',
    framing: 'X-Frame-Options',
    referrer: 'Referrer-Policy',
    permissions: 'Permissions-Policy',
    coop: 'Cross-Origin-Opener-Policy',
    cookies: 'Set-Cookie',
    sri: 'Subresource Integrity',
    'version-disclosure': 'Server / X-Powered-By',
    'mixed-content': 'Mixed content',
    'login-page': 'Login page',
    'password-form-http': 'Password form',
    'safe-browsing': 'Safe Browsing'
  };
  const TLS_IDS = new Set(['https', 'https-redirect', 'tls-cert', 'tls-expiry', 'tls-version', 'hsts']);
  const notBuiltWith = /^(Webmail|Hosting|CDN|Miscellaneous|Email|Security|PaaS|IaaS|Reverse proxies|Load balancers|SSL\/TLS certificate authorities|Domain parking|Web servers)$/;
  const typeLabel = (t: TechnologyDetection) => (/ DNS$/.test(t.name) ? 'DNS provider' : t.categories.map((c) => c.name).join(', '));
  const ipLine = (ip: IpInfo) => dot(ip.ip, ip.asn ? `AS${ip.asn}${ip.asnOrg ? ` ${ip.asnOrg}` : ''}` : null, ip.country, ip.reverseDns);
  const METRIC = { lcpMs: { n: 'LCP', t: 'Largest Contentful Paint' }, cls: { n: 'CLS', t: 'Cumulative Layout Shift' }, inpMs: { n: 'INP', t: 'Interaction to Next Paint' }, tbtMs: { n: 'TBT', t: 'Total Blocking Time (lab proxy for INP)' }, ttfbMs: { n: 'TTFB', t: 'Time to First Byte' } } as const;
  const fmtMetric = (m: keyof typeof CWV_THRESHOLDS, v: number) => (m === 'cls' ? v.toFixed(2) : v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`);
  const fmtTarget = (m: keyof typeof CWV_THRESHOLDS) => (m === 'cls' ? CWV_THRESHOLDS[m][0].toFixed(2) : CWV_THRESHOLDS[m][0] >= 1000 ? `${(CWV_THRESHOLDS[m][0] / 1000).toFixed(2)}s` : `${CWV_THRESHOLDS[m][0]}ms`);
  const verdictBadge = { good: { c: 'pass', t: 'Good' }, 'needs-work': { c: 'warn', t: 'Needs work' }, poor: { c: 'fail', t: 'Poor' } } as const;
  const verdictClass = { good: '', 'needs-work': 'a', poor: 'r' } as const;

  // ---------- derived ----------
  let scores = $derived(report?.scores ?? null);
  let overall = $derived(!running && scores?.overall != null ? scores.overall : null);
  let ringOffset = $derived(overall === null ? 377 : Math.round(377 * (1 - overall / 100)));
  let tone = $derived(scoreTone(overall));
  let sectionScore = (id: string) => scores?.sections.find((s) => s.id === id)?.score ?? null;
  let headerFindings = $derived((report?.security ?? []).filter((f) => !TLS_IDS.has(f.id)));
  let tlsFindings = $derived((report?.security ?? []).filter((f) => TLS_IDS.has(f.id)));
  let techFilter = $state('');
  let headerFilter = $state('');
  let techs = $derived((report?.technologies ?? []).filter((t) => !techFilter || t.name.toLowerCase().includes(techFilter.toLowerCase()) || t.categories.some((c) => c.name.toLowerCase().includes(techFilter.toLowerCase()))));
  let anyVersion = $derived((report?.technologies ?? []).some((t) => t.version));
  let tiles = $derived((report?.technologies ?? []).filter((t) => !t.implied && t.confidence !== 'low' && !t.categories.every((c) => notBuiltWith.test(c.name))).slice(0, 12));
  let platformName = $derived(report?.cms ? { wordpress: 'WordPress', shopify: 'Shopify', webflow: 'Webflow', wix: 'Wix', squarespace: 'Squarespace' }[report.cms.platform] : '');
  let themeLine = $derived(report?.cms?.theme ? dot(`${report.cms.theme.name ?? report.cms.theme.slug}${report.cms.theme.version ? ` ${report.cms.theme.version}` : ''}`, report.cms.theme.author ? `by ${report.cms.theme.author}` : null) : '');
  let chain = $derived.by((): (CertChainEntry & { role: string })[] => {
    const c = report?.tls?.chain ?? [];
    if (c.length) return [...c].reverse().map((e, i, arr) => ({ ...e, role: i === arr.length - 1 ? 'Leaf' : e.selfSigned || i === 0 ? 'Root CA' : 'Intermediate' }));
    if (report?.cert) return [{ subject: report.cert.subject, issuer: report.cert.issuer, notBefore: report.cert.notBefore, notAfter: report.cert.notAfter, keyType: null, keyBits: null, curve: null, selfSigned: false, role: 'Leaf' }];
    return [];
  });
  let certDays = $derived(daysUntil(report?.cert?.notAfter));
  let certOk = $derived(!!report?.tls?.authorized);
  let vitalRows = $derived(report?.performance ? vitals(report.performance) : []);
  let needsWork = $derived(vitalRows.filter((v) => v.verdict !== 'good').length);
  let serverLine = $derived.by(() => {
    if (!report) return '';
    const s = report.http?.server;
    let base = 'Not disclosed';
    if (s) base = report.infra.cdn && new RegExp(report.infra.cdn.name.split(' ')[0]!, 'i').test(s) ? `Not disclosed (behind ${report.infra.cdn.name})` : s;
    return dot(base, report.http?.poweredBy);
  });
  let connectionLine = $derived(report ? dot(report.tls?.alpn === 'h2' ? 'HTTP/2' : (report.tls?.alpn ?? null), report.http?.http3 ? 'HTTP/3 available' : null, report.http?.compression ? `${report.http.compression} compression` : null) || '—' : '');
  let seoValues = $derived.by((): Record<string, string | null> => {
    const s = report?.seo;
    if (!s) return {};
    return {
      title: s.title,
      description: s.metaDescription,
      canonical: s.canonical,
      sitemap: report?.robots?.sitemaps[0] ?? null,
      robots: report?.robots?.present ? `${report.robots.groups} group(s)${report.robots.disallowAll ? ' · blocks all' : ''}` : null,
      'structured-data': s.structuredData.types.length ? s.structuredData.types.slice(0, 6).join(' · ') : null,
      og: s.openGraph['og:image'] ?? null,
      lang: s.lang,
      viewport: s.viewport,
      h1: s.h1[0] ?? null
    };
  });
  const SEO_CODES: Record<string, string> = { title: 'title', description: 'meta description', canonical: 'canonical', sitemap: 'sitemap.xml', robots: 'robots.txt', 'structured-data': 'structured data', og: 'og:image', lang: 'lang', viewport: 'viewport', h1: 'h1', indexable: 'robots meta', 'img-alt': 'img alt' };
  let httpBadge = $derived.by(() => {
    const st = report?.http?.status ?? null;
    if (st === null) return { c: 'neutral', t: 'No response' } as const;
    return { c: st < 400 ? 'pass' : 'fail', t: `HTTP ${st}` } as const;
  });
  let nav = $derived([
    ...(scores?.sections ?? []).filter((s) => s.score !== null).map((s) => ({ href: `#c-${s.id === 'headers' ? 'headers' : s.id === 'tls' ? 'tls' : s.id === 'performance' ? 'vitals' : s.id}`, label: s.label, value: running ? null : `${s.score} / 100`, tone: running ? 'grey' : scoreTone(s.score) })),
    { href: '#c-stack', label: 'Technology', value: `${report?.technologies.length ?? 0} found`, tone: 'grey' as const },
    { href: '#c-hosting', label: 'Hosting & DNS', value: report?.infra.cdn?.name ?? report?.infra.hosting?.name ?? '', tone: 'grey' as const },
    ...(report?.external.subdomains ? [{ href: '#c-subdomains', label: 'Subdomains', value: `${report.external.subdomains.total} found`, tone: 'grey' as const }] : []),
    ...(report?.cms ? [{ href: '#c-cms', label: platformName, value: `${report.cms.plugins.length} plugins`, tone: 'grey' as const }] : []),
    ...(report?.screenshot ? [{ href: '#c-shot', label: 'Screenshot', value: '', tone: 'grey' as const }] : [])
  ]);

  // ---------- actions ----------
  let shareLabel = $state('Share');
  async function share() {
    try {
      await navigator.clipboard.writeText(location.href);
      shareLabel = 'Copied';
    } catch {
      shareLabel = 'Copy failed';
    }
    setTimeout(() => (shareLabel = 'Share'), 1500);
  }
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
          window.location.assign(url);
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
{#if report?.safeBrowsing?.threats.length}
  <p class="alert alert-fail" role="alert"><strong>Google Safe Browsing flags this site</strong> ({report.safeBrowsing.threats.join(', ').toLowerCase()}). Visit with care.</p>
{/if}
{#if report && (report.http?.challenge || report.scan.quality === 'restricted')}
  <p class="alert alert-warn">This website blocks automated visitors{report.http?.challenge ? ` (${report.http.challenge.vendor})` : ''}, so page-based checks are limited. Domain, DNS and certificate information was still collected.</p>
{/if}

<div class="card topbar">
  <div class="tmain">
    <div class="glyph" aria-hidden="true">{data.scan.displayHost[0]}</div>
    <div style="min-width: 0">
      <p class="print-only small muted" style="margin-bottom: 4px">Website report · {fmtDate(data.scan.createdAt)} · site-scan.farhan.app</p>
      <div class="ttitle">
        <h1 class="turl"><a href={report?.http?.finalUrl ?? data.scan.url} rel="noopener nofollow" target="_blank">{data.scan.displayHost}</a></h1>
        {#if report}<Badge status={httpBadge.c} label={httpBadge.t} />{/if}
        {#if status !== 'complete'}<Badge status={status === 'failed' ? 'fail' : running ? 'info' : 'warn'} label={statusText[status] ?? status} />{/if}
      </div>
      <div class="tmeta">
        <span>{durationMs ? `${fmtMs(durationMs)} scan` : running ? 'In progress' : 'Scan'}</span><span aria-hidden="true">·</span>
        <span>{fmtDate(data.scan.createdAt, true)}</span>
        {#if report?.infra.ips[0]}<span aria-hidden="true">·</span><span class="mono">IP: {report.infra.ips[0].ip}</span>{/if}
        <span aria-hidden="true">·</span><span class="mono" title={data.scan.id}>ID: {data.scan.id.slice(0, 8)}…</span>
        <span aria-hidden="true" class="no-print">·</span><a class="link no-print" href="/api/scans/{data.scan.id}" rel="nofollow">JSON</a>
      </div>
    </div>
  </div>
  <div class="tactions no-print">
    <button class="btn btn-outline" type="button" onclick={share}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" /></svg>{shareLabel}</button>
    <a class="btn btn-outline" href="/?url={encodeURIComponent(data.scan.url)}" title="Runs a fresh scan if the cached result is older than 15 minutes"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21h5v-5" /></svg>Re-run</a>
    {#if !running}<button class="btn btn-outline" type="button" onclick={downloadPdf} disabled={pdfState === 'preparing'} aria-live="polite">{pdfState === 'preparing' ? 'Preparing PDF…' : pdfState === 'error' ? 'PDF failed, retry' : 'Download PDF'}</button>{/if}
    <a class="btn btn-primary" href="/">New target</a>
  </div>
</div>

{#if running || !report}
  <div class="card" style="margin-bottom: 16px">
    <div class="card-h"><div><div class="card-title">{running ? 'Running scan' : 'No results'}</div><div class="card-sub">{running ? 'Usually 10–40 seconds. Results fill in below as each step finishes.' : scanError ?? 'The scan produced no data.'}</div></div></div>
    <div class="card-body"><ScanLog host={data.scan.displayHost} {stages} {status} /></div>
    {#if scanError && !running}<p class="note fail">{scanError}</p>{/if}
  </div>
{/if}

{#if report}
  <div class="split">
    <aside class="left">
      <div class="card scorecard">
        <div class="ringbox" role="img" aria-label={overall === null ? 'Score pending' : `Health index ${overall} out of 100`}>
          <svg viewBox="0 0 140 140" aria-hidden="true"><circle class="ring-bg" cx="70" cy="70" r="60" /><circle class="ring-val {tone}" cx="70" cy="70" r="60" style="stroke-dashoffset: {ringOffset}" /></svg>
          <div class="ringtext"><span class="ringnum">{overall ?? '–'}</span><span class="ringscale">/ 100</span></div>
        </div>
        {#if overall !== null && scores}
          <div class="rank {tone}">Grade {scores.grade} Health Index</div>
          <div class="ranksub">{scores.summary}</div>
        {:else}
          <div class="rank grey">Score pending</div>
          <div class="ranksub">{running ? 'The Health Index is calculated once every step has finished.' : 'Not enough data was collected to score this site.'}</div>
        {/if}
      </div>
      <div class="card checklist">
        <div class="lab">Report sections</div>
        {#each nav as n (n.href)}
          <a class="chk" href={n.href}><b>{n.label}</b>{#if n.value}<span class={toneClass[n.tone]}>{n.value}</span>{/if}</a>
        {/each}
      </div>
    </aside>

    <div class="stream">
      <!-- ===== Technology ===== -->
      <div class="card allow-break" id="c-stack">
        <div class="card-h"><div><div class="card-title">Technology fingerprint</div><div class="card-sub">Platform, CDN, analytics and third-party scripts identified from the page, headers and DNS.</div></div><span class="badge badge-neutral">{report.technologies.length} detected</span></div>
        {#if tiles.length}
          <div class="tiles">
            {#each tiles as t (t.slug)}
              <div class="tile"><div class="tile-ic" aria-hidden="true">{initials(t.name)}</div><div><b>{t.name}{#if t.version}&nbsp;{t.version}{/if}</b><span>{t.categories[0]?.name ?? 'Detected'}{#if t.confidence !== 'high'}&nbsp;· {confWord[t.confidence].toLowerCase()}{/if}</span></div></div>
            {/each}
          </div>
        {:else if !report.technologies.length}
          <p class="note">Nothing could be identified with confidence. That doesn't mean the site uses no framework; the public response didn't give enough away.</p>
        {/if}
        {#if report.technologies.length}
          <details class="show-all" open={printMode}>
            <summary>All {report.technologies.length} technologies with confidence</summary>
            <div class="toolbar in-card no-print" style="padding-bottom: 0"><input type="search" class="filter" placeholder="Filter…" bind:value={techFilter} aria-label="Filter technologies" /></div>
            <div class="table-wrap">
              <table class="table compact">
                <thead><tr><th>Confidence</th><th>Name</th><th>Type</th>{#if anyVersion}<th>Version</th>{/if}</tr></thead>
                <tbody>
                  {#each techs as t (t.slug)}
                    <tr><td><Badge status={confBadge[t.confidence]} label={confWord[t.confidence]} /></td><td>{#if t.website}<a href={t.website} rel="noopener nofollow" target="_blank">{t.name}</a>{:else}{t.name}{/if}{#if t.implied}<span class="muted small">&nbsp;· implied</span>{/if}</td><td class="muted">{typeLabel(t)}</td>{#if anyVersion}<td class="mono small">{t.version ?? '—'}</td>{/if}</tr>
                  {:else}
                    <tr><td colspan="4" class="muted">Nothing matches that filter.</td></tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </details>
        {/if}
      </div>

      <!-- ===== Security headers ===== -->
      <div class="card allow-break" id="c-headers">
        <div class="card-h"><div><div class="card-title">HTTP response defence matrix</div><div class="card-sub">Security directives on the homepage response. "Warn" items are hardening opportunities, not proof of a vulnerability.</div></div>{#if headerFindings.length}<input class="filter no-print" placeholder="Filter directives…" aria-label="Filter directives" bind:value={headerFilter} />{/if}</div>
        <FindingsTable findings={headerFindings} codes={HEADER_CODES} filter={headerFilter} empty="No page response to assess." />
        {#if report.cookies.length}
          <div class="card-h" style="border-top: 1px solid var(--border)"><div><div class="card-title">Cookies set on arrival</div><div class="card-sub">{report.cookies.length} cookie(s) before any interaction.</div></div></div>
          <div class="table-wrap">
            <table class="table compact">
              <thead><tr><th>Name</th><th>Set by</th><th>Secure</th><th>HttpOnly</th><th>SameSite</th><th>Lasts</th></tr></thead>
              <tbody>{#each report.cookies as c}<tr><td class="mono small">{c.name}</td><td class="mono small">{c.domain}{c.thirdParty ? ' (third party)' : ''}</td><td>{c.secure ? 'Yes' : 'No'}</td><td>{c.httpOnly ? 'Yes' : 'No'}</td><td>{c.sameSite ?? '—'}</td><td>{c.session ? 'This visit' : 'Persists'}</td></tr>{/each}</tbody>
            </table>
          </div>
        {/if}
      </div>

      <!-- ===== Core Web Vitals ===== -->
      <div class="card" id="c-vitals">
        {#if report.performance}
          {@const p = report.performance}
          <div class="card-h"><div><div class="card-title">Core Web Vitals benchmark</div><div class="card-sub">Lighthouse mobile: performance {p.scores.performance ?? '—'} · accessibility {p.scores.accessibility ?? '—'} · best practices {p.scores.bestPractices ?? '—'} · SEO {p.scores.seo ?? '—'}. Real-user data from Chrome where available.</div></div><span class="badge {needsWork ? 'badge-warn' : 'badge-pass'}">{needsWork ? `${needsWork} of ${vitalRows.length} need work` : 'All good'}</span></div>
          <div class="quad">
            {#each vitalRows as v (v.metric)}
              <div class="vital" title={METRIC[v.metric].t}>
                <div class="n">{METRIC[v.metric].n} <span class="badge badge-{verdictBadge[v.verdict].c}">{verdictBadge[v.verdict].t}</span></div>
                <div class="v">{fmtMetric(v.metric, v.value)}</div>
                <div class="e {verdictClass[v.verdict]}">Target &lt; {fmtTarget(v.metric)} <span class="src">· {v.source === 'field' ? 'real users' : 'lab'}</span></div>
              </div>
            {/each}
          </div>
          {#if p.totalBytes}
            <div class="payload">
              <div class="lab">Wire payload: {fmtBytes(p.totalBytes)}{#if p.requestCount}&nbsp;across {p.requestCount} requests{/if}</div>
              {#if p.breakdown}
                {@const b = p.breakdown}
                JS: <b>{fmtBytes(b.scriptBytes)}</b> · Images: <b>{fmtBytes(b.imageBytes)}</b> · Fonts: <b>{fmtBytes(b.fontBytes)}</b> · CSS: <b>{fmtBytes(b.stylesheetBytes)}</b>{#if b.thirdPartyBytes !== null}&nbsp;· Third-party: <b>{fmtBytes(b.thirdPartyBytes)}</b>{/if}
              {:else}
                <span class="muted">Breakdown by type was not reported for this run.</span>
              {/if}
            </div>
          {/if}
          {#if p.accessibilityIssues.length}
            <div class="findings">
              {#each p.accessibilityIssues.slice(0, 6) as a (a.id)}
                <div class="finding"><span class="badge badge-warn">A11y</span><div><b>{a.title}</b><p>Reported by Lighthouse's automated accessibility checks. Automated checks find only part of the picture.</p><div class="aff">{a.count} element{a.count === 1 ? '' : 's'}</div></div></div>
              {/each}
            </div>
          {/if}
        {:else}
          <div class="card-h"><div><div class="card-title">Core Web Vitals benchmark</div><div class="card-sub">Google PageSpeed Insights, mobile profile.</div></div><span class="badge badge-neutral">Not measured</span></div>
          <p class="note">Performance data is not available for this scan{running ? ' yet' : ''}.</p>
        {/if}
      </div>

      <!-- ===== Certificate chain ===== -->
      <div class="card" id="c-tls">
        <div class="card-h"><div><div class="card-title">Certificate chain</div><div class="card-sub">{report.tls?.source === 'handshake' ? 'TLS handshake and trust path to a public root.' : report.cert ? 'From Certificate Transparency logs; the handshake could not be completed.' : 'No certificate information available.'}</div></div>{#if report.tls?.protocol}<Badge status={certOk ? 'pass' : 'fail'} label={certOk ? `${report.tls.protocol} active` : 'Not valid'} />{/if}</div>
        {#if chain.length}
          <div class="chain">
            {#each chain as c, i (i)}
              {@const leaf = c.role === 'Leaf'}
              {@const cls = leaf ? (!certOk || (certDays !== null && certDays < 0) ? 'fail' : certDays !== null && certDays < 21 ? 'warn' : '') : ''}
              <div class="step">
                <div class="step-ic {cls}" aria-hidden="true">{#if cls === 'fail'}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6 6 18M6 6l12 12" /></svg>{:else}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5" /></svg>{/if}</div>
                <div>
                  <b>{c.role}: {c.subject ?? 'Unknown'}</b>
                  {#if leaf}
                    <span class={cls === 'fail' ? 'r' : cls === 'warn' ? 'a' : 'g'}>{dot(!certOk ? (report.tls?.authorizationError ?? 'Not trusted') : certDays !== null ? (certDays < 0 ? `Expired ${-certDays} days ago` : `Valid (${certDays} days remaining)`) : 'Valid', report.tls?.cipher ?? null)}</span>
                    <span>{dot(c.keyType ? `${c.keyType} ${c.curve ?? c.keyBits ?? ''}`.trim() : null, c.issuer ? `Issued by ${c.issuer}` : null, report.cert?.sans.length ? `Covers ${report.cert.sans.length} name${report.cert.sans.length === 1 ? '' : 's'}` : null)}</span>
                  {:else}
                    <span>{dot(c.keyType ? `${c.keyType} ${c.curve ?? c.keyBits ?? ''}`.trim() : null, c.selfSigned ? 'Self-signed trust anchor' : c.issuer ? `Signed by ${c.issuer}` : null, c.notAfter ? `Expires ${fmtDate(c.notAfter)}` : null)}</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
        {#if tlsFindings.length}
          <div class="findings">
            {#each tlsFindings.filter((f) => f.status !== 'good') as f (f.id)}
              <div class="finding"><Badge status={f.status} /><div><b>{f.title}</b><p>{f.observed}</p>{#if f.detail}<p>{f.detail}</p>{/if}</div></div>
            {/each}
            {#if tlsFindings.every((f) => f.status === 'good')}
              <div class="finding"><span class="badge badge-pass">Pass</span><div><b>All HTTPS checks pass</b><p>{tlsFindings.map((f) => f.title).join(' · ')}</p></div></div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- ===== SEO ===== -->
      <div class="card allow-break" id="c-seo">
        <div class="card-h"><div><div class="card-title">SEO &amp; meta tags</div><div class="card-sub">Homepage metadata and crawl configuration.</div></div>{#if sectionScore('seo') !== null && !running}<Badge status={scoreTone(sectionScore('seo'))} label="{sectionScore('seo')} / 100" />{/if}</div>
        {#if report.seo}
          <FindingsTable findings={report.seo.findings} codes={SEO_CODES} values={seoValues} />
          <div class="table-wrap">
            <table class="table kv compact">
              <tbody>
                <tr><td>Headings</td><td class="small">{Object.entries(report.seo.headingCounts).filter(([, v]) => v).map(([k, v]) => `${k.toUpperCase()}: ${v}`).join(' · ') || '—'}</td></tr>
                <tr><td>Links</td><td class="small">{report.seo.links.internal} internal · {report.seo.links.external} external</td></tr>
                <tr><td>Images without alt text</td><td class="small">{report.seo.images.missingAlt} of {report.seo.images.total}</td></tr>
                {#if report.seo.hreflang.length}<tr><td>Languages (hreflang)</td><td class="small">{report.seo.hreflang.slice(0, 10).join(', ')}</td></tr>{/if}
                {#if report.robots}<tr><td>AI crawlers</td><td class="small">{#if report.robots.aiCrawlers.some((a) => a.blocked)}Blocked: {report.robots.aiCrawlers.filter((a) => a.blocked).map((a) => a.agent).join(', ')}{:else}All allowed (no AI-specific rules){/if}</td></tr>{/if}
                <tr><td>Well-known files</td><td class="small">{[report.wellKnown.securityTxt && 'security.txt', report.wellKnown.adsTxt && 'ads.txt', report.wellKnown.llmsTxt && 'llms.txt'].filter(Boolean).join(', ') || 'None found'}</td></tr>
              </tbody>
            </table>
          </div>
        {:else}<p class="note">No page to assess.</p>{/if}
      </div>

      <!-- ===== Email ===== -->
      <div class="card allow-break" id="c-email">
        <div class="card-h"><div><div class="card-title">Email protection</div><div class="card-sub">Whether others can send email pretending to be this domain.</div></div>{#if sectionScore('email') !== null && !running}<Badge status={scoreTone(sectionScore('email'))} label="{sectionScore('email')} / 100" />{/if}</div>
        {#if report.email.length}
          <div class="findings">
            {#each [...report.email].sort((a, b) => ({ bad: 0, warn: 1, good: 2, info: 3, unknown: 4, na: 5 }[a.status] ?? 9) - ({ bad: 0, warn: 1, good: 2, info: 3, unknown: 4, na: 5 }[b.status] ?? 9)) as f (f.id)}
              <div class="finding"><Badge status={f.status} /><div><b>{f.title}</b><p>{f.observed}</p>{#if f.detail}<p class="muted">{f.detail}</p>{/if}</div></div>
            {/each}
          </div>
        {:else}<p class="note">DNS could not be read for this domain.</p>{/if}
      </div>

      <!-- ===== Hosting & DNS ===== -->
      <div class="card allow-break" id="c-hosting">
        <div class="card-h"><div><div class="card-title">Hosting &amp; DNS</div><div class="card-sub">A CDN in front of a site hides where it's really hosted. We only name a host when there's evidence for it.</div></div></div>
        <div class="table-wrap">
          <table class="table kv compact">
            <tbody>
              <tr><td>CDN / reverse proxy</td><td>{report.infra.cdn?.name ?? 'None seen'}</td></tr>
              <tr><td>Firewall / bot protection</td><td>{#if report.infra.waf}{report.infra.waf.name}{#if report.infra.waf.evidence.length === 1 && report.infra.waf.evidence[0]?.source === 'implied'}<div class="insight">{report.infra.waf.evidence[0].value}</div>{/if}{:else}None seen{/if}</td></tr>
              <tr><td>Hosting provider</td><td>{#if report.infra.hosting}{report.infra.hosting.name}&nbsp;<Badge status={confBadge[report.infra.hosting.confidence]} label={confWord[report.infra.hosting.confidence]} />{:else if report.infra.cdn}<strong>Not publicly visible.</strong> The site is served through {report.infra.cdn.name}, which hides the real server.{:else}Unknown{/if}</td></tr>
              <tr><td>Web server software</td><td>{serverLine}</td></tr>
              <tr><td>Connection</td><td>{connectionLine}</td></tr>
              {#each report.infra.ips as ip (ip.ip)}<tr><td>IP address</td><td class="mono small">{ipLine(ip)}</td></tr>{/each}
              <tr><td>DNS provider</td><td>{report.infra.dnsProvider?.name ?? '—'}</td></tr>
              <tr><td>Email provider</td><td>{report.infra.emailProvider?.name ?? 'No email set up'}</td></tr>
              {#if report.external.greenHosting}<tr><td>Green hosting</td><td>{report.external.greenHosting.green ? `Yes: ${report.external.greenHosting.hostedBy ?? 'listed by the Green Web Foundation'}` : 'Not listed by the Green Web Foundation'}</td></tr>{/if}
              {#if report.http?.chain && report.http.chain.length > 1}<tr><td>Redirects</td><td>{#each report.http.chain as hop}<div class="mono small">{hop.location ? `${hop.status} ${hop.url} → ${hop.location}` : `${hop.status} ${hop.url}`}</div>{/each}</td></tr>{/if}
              {#if Object.keys(report.http?.cacheHeaders ?? {}).length}<tr><td>Caching</td><td>{#each Object.entries(report.http?.cacheHeaders ?? {}) as [k, v]}<div class="mono small">{k}: {v}</div>{/each}</td></tr>{/if}
              {#if report.domain}
                <tr><td>Registrar</td><td>{report.domain.registrar ?? 'Not disclosed'}</td></tr>
                <tr><td>Registered</td><td>{dot(fmtDate(report.domain.created), report.external.wayback ? `online since at least ${fmtDate(report.external.wayback)}` : null)}</td></tr>
                <tr><td>Domain expires</td><td>{fmtDate(report.domain.expires)}{#if daysUntil(report.domain.expires) !== null}{@const d = daysUntil(report.domain.expires)!}&nbsp;<Badge status={d < 30 ? 'fail' : d < 90 ? 'warn' : 'pass'} label="{d} days" />{/if}</td></tr>
                {#if report.domain.status.length}<tr><td>Domain status</td><td class="small">{report.domain.status.join(', ')}</td></tr>{/if}
              {/if}
            </tbody>
          </table>
        </div>
        {#if report.dns}
          <div class="card-h" style="border-top: 1px solid var(--border)"><div><div class="card-title">DNS records</div></div></div>
          <div class="table-wrap">
            <table class="table compact">
              <thead><tr><th style="width: 80px">Type</th><th>Value</th></tr></thead>
              <tbody>
                {#each report.dns.A as v}<tr><td class="code-cell">A</td><td class="mono small wrap">{v}</td></tr>{/each}
                {#each report.dns.AAAA as v}<tr><td class="code-cell">AAAA</td><td class="mono small wrap">{v}</td></tr>{/each}
                {#each report.dns.CNAME as v}<tr><td class="code-cell">CNAME</td><td class="mono small wrap">{v}</td></tr>{/each}
                {#each report.dns.NS as v}<tr><td class="code-cell">NS</td><td class="mono small wrap">{v}</td></tr>{/each}
                {#each report.dns.MX as v}<tr><td class="code-cell">MX</td><td class="mono small wrap">{v.priority} {v.exchange}</td></tr>{/each}
                {#each report.dns.TXT as v}<tr><td class="code-cell">TXT</td><td class="mono small wrap">{v}</td></tr>{/each}
                {#each report.dns.CAA as v}<tr><td class="code-cell">CAA</td><td class="mono small wrap">{v}</td></tr>{/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>

      <!-- ===== Subdomains ===== -->
      {#if report.external.subdomains}
        {@const sd = report.external.subdomains}
        <div class="card allow-break" id="c-subdomains">
          <div class="card-h"><div><div class="card-title">Subdomains</div><div class="card-sub">Hostnames under {report.target.registrableDomain} that have had a TLS certificate issued, from public Certificate Transparency logs.</div></div><span class="badge badge-neutral">{sd.total} found</span></div>
          {#if sd.names.length}
            <div class="chips-grid">
              {#each sd.names as n (n)}<span class="val">{n}</span>{/each}
            </div>
            <p class="note">Passive discovery only: nothing was probed and some names may no longer exist.{#if sd.total > sd.names.length}&nbsp;Showing the first {sd.names.length} of {sd.total}.{/if}</p>
          {:else}
            <p class="note">No other hostnames appear in Certificate Transparency logs for this domain.</p>
          {/if}
        </div>
      {/if}

      <!-- ===== Privacy ===== -->
      <div class="card allow-break" id="c-privacy">
        <div class="card-h"><div><div class="card-title">Privacy &amp; third parties</div><div class="card-sub">Trackers, ad pixels, consent and everything the page loads from other companies.</div></div>{#if sectionScore('privacy') !== null && !running}<Badge status={scoreTone(sectionScore('privacy'))} label="{sectionScore('privacy')} / 100" />{/if}</div>
        {#if report.privacy.length}
          <div class="findings">
            {#each report.privacy as f (f.id)}
              <div class="finding"><Badge status={f.status} /><div><b>{f.title}</b><p>{f.observed}</p>{#if f.detail}<p class="muted">{f.detail}</p>{/if}</div></div>
            {/each}
          </div>
        {/if}
        {#if report.thirdParties.length}
          <div class="card-h" style="border-top: 1px solid var(--border)"><div><div class="card-title">Third-party services</div></div><span class="badge badge-neutral">{report.thirdParties.length} domains</span></div>
          <div class="table-wrap">
            <table class="table compact" style="min-width: 520px">
              <thead><tr><th>Service</th><th>Purpose</th><th>Domain</th><th class="num">Requests</th></tr></thead>
              <tbody>{#each report.thirdParties as t (t.domain)}<tr><td>{t.technology ?? `Unknown (${t.domain.split('.').slice(-2).join('.')})`}</td><td class="muted">{t.category ?? '—'}</td><td class="mono small wrap">{t.domain}</td><td class="num">{t.count}</td></tr>{/each}</tbody>
            </table>
          </div>
        {/if}
      </div>

      <!-- ===== CMS ===== -->
      {#if report.cms}
        <div class="card allow-break" id="c-cms">
          <div class="card-h"><div><div class="card-title">{platformName}</div><div class="card-sub">{report.cms.platform === 'wordpress' ? 'Version, theme and plugins visible from the homepage.' : 'Theme and apps visible from the homepage.'}</div></div>{#if report.cms.version}<span class="tag">v{report.cms.version}</span>{/if}</div>
          {#if report.cms.flags.length}
            <div class="findings">
              {#each report.cms.flags as f (f.id)}
                <div class="finding"><Badge status={f.status} /><div><b>{f.title}</b><p>{f.observed}</p>{#if f.detail}<p class="muted">{f.detail}</p>{/if}</div></div>
              {/each}
            </div>
          {/if}
          {#if report.cms.theme || report.cms.plugins.length}
            <div class="table-wrap">
              <table class="table compact">
                <thead><tr><th>Component</th><th>Name</th><th>Version</th><th>Slug</th></tr></thead>
                <tbody>
                  {#if report.cms.theme}<tr><td class="code-cell">theme</td><td>{themeLine}</td><td class="mono small">{report.cms.theme.version ?? '—'}</td><td class="mono small">{report.cms.theme.slug}</td></tr>{/if}
                  {#each report.cms.plugins as p (p.slug)}<tr><td class="code-cell">{report.cms.platform === 'wordpress' ? 'plugin' : 'app'}</td><td>{p.name ?? '—'}</td><td class="mono small">{p.version ?? '—'}</td><td class="mono small">{p.slug}</td></tr>{/each}
                </tbody>
              </table>
            </div>
          {:else}
            <p class="note">The site runs {platformName}, but it doesn't reveal its version, theme or {report.cms.platform === 'wordpress' ? 'plugins' : 'apps'} from the homepage. That's normal for a hardened or heavily customised setup.</p>
          {/if}
        </div>
      {/if}

      <!-- ===== Screenshot ===== -->
      {#if report.screenshot}
        <div class="card" id="c-shot">
          <div class="card-h"><div><div class="card-title">Screenshot</div><div class="card-sub">Desktop viewport, above the fold.</div></div></div>
          {#if 'url' in report.screenshot}<a class="shot" href={report.screenshot.url} target="_blank" rel="noopener" title="Open full screenshot"><img src={report.screenshot.url} alt="Screenshot of {data.scan.displayHost}" width={report.screenshot.width} height={report.screenshot.height} /></a>{:else}<div class="shot"><img src={report.screenshot.dataUrl} alt="Screenshot of {data.scan.displayHost}" /></div>{/if}
        </div>
      {/if}

      <p class="note no-print" style="border: 0; padding: 0 4px">{dot(`Scanner ${report.scan.scannerVersion}`, report.scan.fingerprintsVersion ? `fingerprints ${report.scan.fingerprintsVersion}` : null, `report v${report.reportVersion}`)}</p>
    </div>
  </div>
{/if}
