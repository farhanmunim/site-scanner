<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import type { Finding, IpInfo, Report, StageMeta, StageName, TechnologyDetection, CertChainEntry } from '@site-scanner/core/types';
  import { CWV_THRESHOLDS, scoreTone, vitals } from '@site-scanner/core/analyze/score';
  import { PROFILE_LABELS } from '@site-scanner/core/analyze/profile';
  import { explainFailure } from '@site-scanner/core/analyze/reasons';
  import Findings from '$lib/v2/Findings.svelte';
  import { subscribeScan, TERMINAL } from '$lib/scan-events';
  import { daysUntil, fmtBytes, fmtDate, fmtMs } from '$lib/format';
  import { STAGE_ORDER } from '@site-scanner/core/types';

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
      for (const d of document.querySelectorAll('details')) d.open = true;
    }
    // A hash link into a collapsed accordion should open it.
    const reveal = () => {
      const id = location.hash.slice(1);
      const el = id && document.getElementById(id);
      if (!el) return;
      let d = el.closest('details');
      while (d) {
        d.open = true;
        d = d.parentElement?.closest('details') ?? null;
      }
      el.scrollIntoView({ block: 'start' });
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    if (!running) return () => window.removeEventListener('hashchange', reveal);
    const unsub = subscribeScan(data.scan.id, (u) => {
      status = u.status;
      if (u.stages) stages = u.stages;
      if (u.report) report = u.report;
      scanError = u.error ?? null;
      if (TERMINAL.has(u.status)) void fetch(`/api/scans/${data.scan.id}`).then((r) => r.json()).then((j: { durationMs?: number | null; report?: Report | null }) => { durationMs = j.durationMs ?? null; if (j.report) report = j.report; }).catch(() => {});
    });
    return () => {
      window.removeEventListener('hashchange', reveal);
      unsub();
    };
  });

  // ---------- helpers ----------
  const dot = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');
  const initials = (name: string) => name.split(/[\s.-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || name.slice(0, 2).toUpperCase();
  const confWord = { high: 'Certain', medium: 'Likely', low: 'Possible' } as const;
  const confChip = { high: 'green', medium: 'orange', low: '' } as const;
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
  const SEO_CODES: Record<string, string> = { title: 'title', description: 'meta description', canonical: 'canonical', sitemap: 'sitemap.xml', robots: 'robots.txt', 'structured-data': 'structured data', og: 'og:image', lang: 'lang', viewport: 'viewport', h1: 'h1', indexable: 'robots meta', 'img-alt': 'img alt' };
  const TLS_IDS = new Set(['https', 'https-redirect', 'tls-cert', 'tls-chain', 'tls-expiry', 'tls-version', 'hsts']);
  const notBuiltWith = /^(Webmail|Hosting|CDN|Miscellaneous|Email|Security|PaaS|IaaS|Reverse proxies|Load balancers|SSL\/TLS certificate authorities|Domain parking|Web servers)$/;
  const typeLabel = (t: TechnologyDetection) => (/ DNS$/.test(t.name) ? 'DNS provider' : t.categories.map((c) => c.name).join(', '));
  const ipLine = (ip: IpInfo) => dot(ip.ip, ip.asn ? `AS${ip.asn}${ip.asnOrg ? ` ${ip.asnOrg}` : ''}` : null, ip.country, ip.reverseDns);
  /** Anycast sites publish many addresses on one network; show one line per network. */
  let ipGroups = $derived.by(() => {
    const groups = new Map<string, { label: string; ips: IpInfo[] }>();
    for (const ip of report?.infra.ips ?? []) {
      const key = ip.asn ? `AS${ip.asn}` : (ip.asnOrg ?? 'unknown');
      const label = dot(ip.asn ? `AS${ip.asn}${ip.asnOrg ? ` ${ip.asnOrg}` : ''}` : (ip.asnOrg ?? 'Unknown network'), ip.country);
      const g = groups.get(key) ?? { label, ips: [] };
      g.ips.push(ip);
      groups.set(key, g);
    }
    return [...groups.values()];
  });
  const METRIC = { lcpMs: { n: 'LCP', t: 'Largest Contentful Paint' }, cls: { n: 'CLS', t: 'Cumulative Layout Shift' }, inpMs: { n: 'INP', t: 'Interaction to Next Paint' }, tbtMs: { n: 'TBT', t: 'Total Blocking Time (lab proxy for INP)' }, ttfbMs: { n: 'TTFB', t: 'Time to First Byte' } } as const;
  const fmtMetric = (m: keyof typeof CWV_THRESHOLDS, v: number) => (m === 'cls' ? v.toFixed(2) : v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`);
  const fmtTarget = (m: keyof typeof CWV_THRESHOLDS) => (m === 'cls' ? CWV_THRESHOLDS[m][0].toFixed(2) : CWV_THRESHOLDS[m][0] >= 1000 ? `${(CWV_THRESHOLDS[m][0] / 1000).toFixed(2)}s` : `${CWV_THRESHOLDS[m][0]}ms`);
  const verdictChip = { good: { c: 'green', t: 'Good', b: 'g' }, 'needs-work': { c: 'orange', t: 'Needs work', b: 'a' }, poor: { c: 'red', t: 'Poor', b: 'r' } } as const;
  const barPct = (m: keyof typeof CWV_THRESHOLDS, v: number) => Math.max(6, Math.min(100, Math.round((v / (CWV_THRESHOLDS[m][1] * 1.25)) * 100)));
  const toneBar = { green: 'g', amber: 'a', red: 'r', grey: '' } as const;

  // ---------- derived ----------
  let scores = $derived(report?.scores ?? null);
  let failed = $derived(!running && report?.scan.quality === 'failed');
  let failureReason = $derived(failed ? explainFailure(report?.stages?.http?.note ?? scanError) : null);
  let overall = $derived(!running && scores?.overall != null ? scores.overall : null);
  let tone = $derived(scoreTone(overall));
  let sectionScore = (id: string) => scores?.sections.find((s) => s.id === id)?.score ?? null;
  let sectionNote = (id: string) => scores?.sections.find((s) => s.id === id)?.note ?? null;
  let headerFindings = $derived((report?.security ?? []).filter((f) => !TLS_IDS.has(f.id)));
  let tlsFindings = $derived((report?.security ?? []).filter((f) => TLS_IDS.has(f.id)));
  let techFilter = $state('');
  let subFilter = $state('');
  let techs = $derived((report?.technologies ?? []).filter((t) => !techFilter || t.name.toLowerCase().includes(techFilter.toLowerCase()) || t.categories.some((c) => c.name.toLowerCase().includes(techFilter.toLowerCase()))));
  let anyVersion = $derived((report?.technologies ?? []).some((t) => t.version));
  let tiles = $derived((report?.technologies ?? []).filter((t) => !t.implied && t.confidence !== 'low' && !t.categories.every((c) => notBuiltWith.test(c.name))).slice(0, 18));
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
  let httpChip = $derived.by(() => {
    const st = report?.http?.status ?? null;
    if (st === null) return { c: '', t: 'No response' } as const;
    return { c: st < 400 ? 'green' : 'red', t: `HTTP ${st}` } as const;
  });
  let subs = $derived(report?.external.subdomains ?? null);
  let subsShown = $derived((subs?.names ?? []).filter((n) => !subFilter || n.includes(subFilter.toLowerCase().trim())));

  /** Every warning and failure across sections, worst first. */
  let fixes = $derived.by(() => {
    if (!report || running) return [] as { f: Finding; section: string; href: string }[];
    const src: [string, string, Finding[] | undefined][] = [
      ['Security headers', '#c-headers', headerFindings],
      ['HTTPS', '#c-tls', tlsFindings],
      ['SEO', '#c-seo', report.seo?.findings],
      ['Email', '#c-email', report.email],
      ['Privacy', '#c-privacy', report.privacy],
      [platformName || 'Platform', '#c-cms', report.cms?.flags]
    ];
    const out: { f: Finding; section: string; href: string }[] = [];
    for (const [section, href, list] of src) for (const f of list ?? []) if ((f.status === 'bad' || f.status === 'warn') && f.relevance !== 'low') out.push({ f, section, href });
    return out.sort((a, b) => (a.f.status === b.f.status ? 0 : a.f.status === 'bad' ? -1 : 1));
  });

  const boardHref: Record<string, string> = { headers: '#c-headers', tls: '#c-tls', performance: '#c-vitals', seo: '#c-seo', email: '#c-email', privacy: '#c-privacy' };
  let board = $derived(
    (scores?.sections ?? []).map((s) => ({ href: boardHref[s.id]!, label: s.label, score: s.score, note: s.note ?? undefined, tone: toneBar[scoreTone(s.score)] }))
  );

  const stageLabel: Record<StageName, string> = { dns: 'Resolving the host', http: 'Fetching the page', files: 'Reading robots, sitemap and scripts', rdap: 'Looking up domain registration', cert: 'Inspecting the TLS certificate', browser: 'Rendering in a browser', external: 'Performance, safety and subdomain checks' };
  const stageRow = (s: StageName) => {
    const st = stages[s]?.status ?? 'pending';
    const terminal = TERMINAL.has(status);
    if (st === 'pending') return { cls: terminal ? 'n' : 'o', r: terminal ? 'skipped' : '' };
    if (st === 'complete') return { cls: 'g', r: 'ok' };
    if (st === 'restricted') return { cls: 'o', r: 'blocked' };
    if (st === 'failed') return { cls: 'r', r: 'failed' };
    return { cls: 'n', r: 'skipped' };
  };

  // ---------- actions ----------
  let shareLabel = $state('Copy link');
  async function share() {
    try {
      await navigator.clipboard.writeText(location.href);
      shareLabel = 'Copied';
    } catch {
      shareLabel = 'Copy failed';
    }
    setTimeout(() => (shareLabel = 'Copy link'), 1500);
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

{#snippet warnIcon()}<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2 1.8 13h12.4L8 2Z" /><path d="M8 6.5v3M8 11.5v.1" /></svg>{/snippet}
{#snippet infoIcon()}<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M8 7.2v4M8 4.9v.1" /></svg>{/snippet}

<div class="frame">
  <div class="rhero">
    <div>
      <div class="meta"><span>Website report</span><span>{fmtDate(data.scan.createdAt, true)}</span><span>{durationMs ? `${fmtMs(durationMs)} scan` : running ? 'In progress' : ''}</span><span title={data.scan.id}>ID {data.scan.id.slice(0, 8)}</span></div>
      <h1 class="h-display two-tone"><span class="lead">Report for</span><span class="tail"><a href={report?.http?.finalUrl ?? data.scan.url} rel="noopener nofollow" target="_blank">{data.scan.displayHost}</a></span></h1>
      <div class="tagline">
        {#if report}<span class="chip {httpChip.c}">{httpChip.t}</span>{/if}
        {#if status !== 'complete'}<span class="chip {status === 'failed' ? 'red' : running ? 'blue' : 'orange'}">{statusText[status] ?? status}</span>{/if}
        {#if report?.profile}<span class="chip" title={report.profile.signals.join(' · ')}>{PROFILE_LABELS[report.profile.kind]}</span>{/if}
        {#if report?.infra.ips[0]}<span class="chip mono">{report.infra.ips[0].ip}</span>{/if}
      </div>
    </div>
    <div class="acts no-print">
      <button class="btn outline sm wide" type="button" onclick={share}>{shareLabel}</button>
      <a class="btn outline sm wide" href="/v2?url={encodeURIComponent(data.scan.url)}" title="Runs a fresh scan if the cached result is older than 15 minutes">Scan again</a>
      {#if !running}<button class="btn outline sm wide" type="button" onclick={downloadPdf} disabled={pdfState === 'preparing'} aria-live="polite">{pdfState === 'preparing' ? 'Preparing PDF…' : pdfState === 'error' ? 'PDF failed, retry' : 'Download PDF'}</button>{/if}
      <a class="btn ghost sm wide" href="/api/scans/{data.scan.id}" rel="nofollow">JSON</a>
    </div>
  </div>
</div>

{#if data.notice || report?.safeBrowsing?.threats.length || failed || (report && (report.http?.challenge || report.scan.quality === 'restricted'))}
  <div class="band-alerts">
    <div class="frame">
      {#if data.notice}<div class="alert info" role="status">{@render infoIcon()}<div>{data.notice}</div></div>{/if}
      {#if report?.safeBrowsing?.threats.length}<div class="alert err" role="alert">{@render warnIcon()}<div><b>Google Safe Browsing flags this site</b> ({report.safeBrowsing.threats.join(', ').toLowerCase()}). Visit with care.</div></div>{/if}
      {#if failed}<div class="alert err" role="alert">{@render warnIcon()}<div><b>We couldn't load this page:</b> {failureReason}. DNS, registration, certificate and email checks still ran; nothing that needs the page could be assessed, so the site is not scored.</div></div>{/if}
      {#if report && (report.http?.challenge || report.scan.quality === 'restricted')}<div class="alert warn">{@render warnIcon()}<div>This website blocks automated visitors{report.http?.challenge ? ` (${report.http.challenge.vendor})` : ''}, so page-based checks are limited. Domain, DNS and certificate information was still collected.</div></div>{/if}
    </div>
  </div>
{/if}

{#if running || !report || failed}
  <section class="band">
    <div class="frame sec compact">
      <div class="runbox">
        <h2 class="h-title">{running ? 'Scanning…' : failed ? 'Scan log' : 'No data'}</h2>
        <p class="sec-desc" style="margin-top: 8px">{running ? 'Usually 10–40 seconds. Results fill in below as each step finishes.' : failed ? 'Which steps ran and where the page fetch stopped.' : (scanError ?? 'The scan produced no data.')}</p>
        <div class="scan-steps" aria-live="polite">
          {#each STAGE_ORDER as s (s)}
            {@const r = stageRow(s)}
            <div class="s {r.cls === 'g' ? 'done' : r.cls === 'o' && r.r ? 'warn' : r.cls === 'r' ? 'fail' : r.cls === 'n' ? 'pend' : ''}" title={stages[s]?.note ?? undefined}>
              {#if r.cls === 'o' && !r.r}<span class="spinner" aria-hidden="true"></span>{:else}<span class="dot {r.cls}" aria-hidden="true"></span>{/if}
              <span class="t">{stageLabel[s]}</span>
              {#if r.r}<span class="r">{r.r}</span>{/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  </section>
{/if}

{#if report}
  <section class="band">
    <div class="frame">
      <div class="verdict">
        <div>
          <div class="score">{overall ?? '–'}{#if overall !== null}<small>/ 100</small>{/if}</div>
          <div class="grade">
            {#if overall !== null && scores}<span class="chip {tone === 'green' ? 'green' : tone === 'amber' ? 'orange' : 'red'}">Grade {scores.grade}</span>{:else}<span class="chip">{running ? 'Score pending' : 'Not scored'}</span>{/if}
          </div>
        </div>
        <div>
          <p class="sum">{#if overall !== null && scores}{scores.summary}{:else if running}The health index is calculated once every step has finished.{:else}{scores?.summary ?? 'Not enough data was collected to score this site.'}{/if}</p>
          {#if report.profile}<p class="spec" style="margin-top: 16px">{dot(...report.profile.signals)}{#if !report.profile.interactive} · login and session checks shown for information only{/if}</p>{/if}
        </div>
        {#if report.screenshot}
          <div class="shot-wrap no-print">
            {#if 'url' in report.screenshot}<a class="shot" href={report.screenshot.url} target="_blank" rel="noopener" title="Open full screenshot"><img src={report.screenshot.url} alt="Screenshot of {data.scan.displayHost}" width={report.screenshot.width} height={report.screenshot.height} /></a>{:else}<div class="shot"><img src={report.screenshot.dataUrl} alt="Screenshot of {data.scan.displayHost}" /></div>{/if}
          </div>
        {/if}
      </div>
      {#if board.length}
        <nav class="board" aria-label="Scores by section">
          {#each board as b (b.href)}
            <a href={b.href} title={b.note}>
              <span class="l">{b.label}</span>
              <span class="v">{#if running}…{:else if b.score === null}<span class="subtle" style="font-size: 18px">{b.href === '#c-vitals' ? 'Not measured' : 'Not scored'}</span>{:else}{b.score}<small>/100</small>{/if}</span>
              <span class="progress-line"><i class={b.tone} style="width: {running || b.score === null ? 0 : b.score}%"></i></span>
            </a>
          {/each}
        </nav>
      {/if}
    </div>
  </section>

  <div class="autonum">
    {#if !running && !failed}
      <section class="band" id="c-fixes">
        <div class="frame sec compact">
          <div class="sec-head">
            <div><div class="sec-num"></div><h2 class="sec-title">What to fix</h2></div>
            <p class="sec-desc">{fixes.length ? `${fixes.length} warning${fixes.length === 1 ? '' : 's'} across all sections, worst first. Warnings are hardening opportunities, not proof of a vulnerability.` : 'Nothing needs attention.'}</p>
          </div>
          {#if fixes.length}
            <div class="frows fixes">
              {#each fixes.slice(0, 12) as x (x.section + x.f.id)}
                <a class="frow" href={x.href}>
                  <span class="chip st {x.f.status}">{x.f.status === 'bad' ? 'Fail' : 'Warn'}</span>
                  <div class="name">{x.f.title}<span class="cd" style="font-family: var(--font-ui); font-size: 13px; line-height: 19px; margin-top: 2px">{x.f.observed}</span></div>
                  <span class="go">{x.section} →</span>
                </a>
              {/each}
            </div>
            {#if fixes.length > 12}<p class="note-s">+{fixes.length - 12} more in the sections below.</p>{/if}
          {:else}
            <div class="allclear"><span class="chip green">All clear</span><span class="muted">No warnings were found in the sections that could be scored.</span></div>
          {/if}
        </div>
      </section>
    {/if}

    <!-- Overview -->
    <section class="band" id="c-overview">
      <div class="frame sec compact">
        <div class="sec-head">
          <div><div class="sec-num"></div><h2 class="sec-title">Overview</h2></div>
          <p class="sec-desc">The essentials at a glance. Each row links to the section with the detail.</p>
        </div>
        <dl class="dlx">
          <dt>Built with</dt>
          <dd>{#if tiles.length}<span class="chips">{#each tiles.slice(0, 8) as t (t.slug)}<a class="chip" href="#c-stack">{t.name}{t.version ? ` ${t.version}` : ''}</a>{/each}{#if report.technologies.length > 8}<a class="chip plain" href="#c-stack">+{report.technologies.length - 8} more</a>{/if}</span>{:else}<span class="muted">{failed ? 'Page could not be loaded' : 'Nothing identified with confidence'}</span>{/if}</dd>
          {#if report.cms}<dt>Platform</dt><dd><a class="a ink" href="#c-cms">{platformName}{report.cms.version ? ` ${report.cms.version}` : ''}</a>{#if themeLine}<span class="sub">Theme {themeLine}</span>{/if}</dd>{/if}
          <dt>Hosting</dt>
          <dd>{#if report.infra.hosting}{report.infra.hosting.name} <span class="chip {confChip[report.infra.hosting.confidence]}" style="margin-left: 4px">{confWord[report.infra.hosting.confidence]}</span>{:else if report.infra.cdn}Hidden behind {report.infra.cdn.name}{:else}Unknown{/if}</dd>
          <dt>CDN / firewall</dt>
          <dd>{dot(report.infra.cdn?.name ?? 'None seen', report.infra.waf && report.infra.waf.name !== report.infra.cdn?.name ? report.infra.waf.name : null)}</dd>
          <dt>DNS provider</dt><dd>{report.infra.dnsProvider?.name ?? '—'}</dd>
          <dt>Email provider</dt><dd>{report.infra.emailProvider?.name ?? 'No email set up'}</dd>
          {#if report.domain}
            <dt>Registered</dt>
            <dd>{fmtDate(report.domain.created)}{#if report.domain.registrar}<span class="sub">with {report.domain.registrar}{report.external.wayback ? ` · online since at least ${fmtDate(report.external.wayback)}` : ''}</span>{:else if report.external.wayback}<span class="sub">online since at least {fmtDate(report.external.wayback)}</span>{/if}</dd>
            <dt>Domain expires</dt>
            <dd>{fmtDate(report.domain.expires)}{#if daysUntil(report.domain.expires) !== null}{@const d = daysUntil(report.domain.expires)!} <span class="chip {d < 30 ? 'red' : d < 90 ? 'orange' : 'green'}" style="margin-left: 4px">{d} days</span>{/if}</dd>
          {/if}
          {#if report.cert?.notAfter}
            <dt>Certificate expires</dt>
            <dd>{fmtDate(report.cert.notAfter)}{#if certDays !== null} <span class="chip {certDays < 7 ? 'red' : certDays < 21 ? 'orange' : 'green'}" style="margin-left: 4px">{certDays} days</span>{/if}{#if report.cert.issuer}<span class="sub">Issued by {report.cert.issuer}</span>{/if}</dd>
          {/if}
          <dt>Connection</dt><dd>{connectionLine}</dd>
          <dt>Subdomains</dt>
          <dd>{#if subs}<a class="a ink" href="#c-subdomains">{subs.total} found</a>{:else if running}<span class="muted">Checking…</span>{:else}<a class="a ink" href="#c-subdomains">Unavailable</a>{/if}</dd>
          <dt>Third parties</dt>
          <dd><a class="a ink" href="#c-privacy">{report.thirdParties.length} external service{report.thirdParties.length === 1 ? '' : 's'}</a>{#if report.privacy.find((f) => f.id === 'analytics')?.observed && !/^No /.test(report.privacy.find((f) => f.id === 'analytics')!.observed)}<span class="sub">{report.privacy.find((f) => f.id === 'analytics')!.observed}</span>{/if}</dd>
        </dl>
      </div>
    </section>

    <!-- Technology -->
    <section class="band" id="c-stack">
      <div class="frame sec compact">
        <div class="sec-head">
          <div><div class="sec-num"></div><h2 class="sec-title">Technology</h2></div>
          <p class="sec-desc">{report.technologies.length} detected: platform, CDN, analytics and third-party scripts identified from the page, headers and DNS.</p>
        </div>
        {#if tiles.length}
          <div class="techgrid">
            {#each tiles as t (t.slug)}
              <div class="tech"><span class="ti" aria-hidden="true">{initials(t.name)}</span><div><b>{t.name}{t.version ? ` ${t.version}` : ''}</b><small>{t.categories[0]?.name ?? 'Detected'}{t.confidence !== 'high' ? ` · ${confWord[t.confidence].toLowerCase()}` : ''}</small></div></div>
            {/each}
          </div>
        {:else if !report.technologies.length}
          <p class="note-s" style="margin-top: 0">{failed ? 'The page could not be loaded, so nothing could be identified.' : "Nothing could be identified with confidence. That doesn't mean the site uses no framework; the public response didn't give enough away."}</p>
        {/if}
        {#if report.technologies.length}
          <div class="acc" style="margin-top: 24px">
            <details open={printMode}>
              <summary>All {report.technologies.length} technologies with confidence</summary>
              <div class="ans flush">
                <div class="no-print" style="margin-bottom: 12px"><input type="search" class="input sm filter" placeholder="Filter…" bind:value={techFilter} aria-label="Filter technologies" /></div>
                <div class="tbox"><div class="tw"><table class="table compact">
                  <thead><tr><th>Confidence</th><th>Name</th><th>Type</th>{#if anyVersion}<th>Version</th>{/if}</tr></thead>
                  <tbody>
                    {#each techs as t (t.slug)}
                      <tr><td><span class="chip {confChip[t.confidence]}">{confWord[t.confidence]}</span></td><td>{#if t.website}<a class="a ink" href={t.website} rel="noopener nofollow" target="_blank">{t.name}</a>{:else}{t.name}{/if}{#if t.implied}<span class="subtle">&nbsp;· implied</span>{/if}</td><td class="k">{typeLabel(t)}</td>{#if anyVersion}<td class="mono">{t.version ?? '—'}</td>{/if}</tr>
                    {:else}
                      <tr><td colspan="4" class="muted">Nothing matches that filter.</td></tr>
                    {/each}
                  </tbody>
                </table></div></div>
              </div>
            </details>
          </div>
        {/if}
      </div>
    </section>

    <!-- CMS -->
    {#if report.cms}
      <section class="band" id="c-cms">
        <div class="frame sec compact">
          <div class="sec-head">
            <div><div class="sec-num"></div><h2 class="sec-title">{platformName}</h2></div>
            <p class="sec-desc">{report.cms.platform === 'wordpress' ? 'Version, theme and plugins visible from the homepage.' : 'Theme and apps visible from the homepage.'}{#if report.cms.version}&nbsp;<span class="tag">v{report.cms.version}</span>{/if}</p>
          </div>
          {#if report.cms.flags.length}<Findings findings={report.cms.flags} open={printMode} />{/if}
          {#if report.cms.theme || report.cms.plugins.length}
            <div class="acc" style="margin-top: 16px">
              <details open={printMode}>
                <summary>{[report.cms.theme ? 'Theme' : null, report.cms.plugins.length ? `${report.cms.plugins.length} ${report.cms.platform === 'wordpress' ? 'plugins' : 'apps'}` : null].filter(Boolean).join(' and ')}</summary>
                <div class="ans flush"><div class="tbox"><div class="tw"><table class="table compact">
                  <thead><tr><th>Component</th><th>Name</th><th>Version</th><th>Slug</th></tr></thead>
                  <tbody>
                    {#if report.cms.theme}<tr><td class="mono">theme</td><td>{themeLine}</td><td class="mono">{report.cms.theme.version ?? '—'}</td><td class="mono">{report.cms.theme.slug}</td></tr>{/if}
                    {#each report.cms.plugins as p (p.slug)}<tr><td class="mono">{report.cms.platform === 'wordpress' ? 'plugin' : 'app'}</td><td>{p.name ?? '—'}</td><td class="mono">{p.version ?? '—'}</td><td class="mono">{p.slug}</td></tr>{/each}
                  </tbody>
                </table></div></div></div>
              </details>
            </div>
          {:else}
            <p class="note-s">The site runs {platformName}, but it doesn't reveal its version, theme or {report.cms.platform === 'wordpress' ? 'plugins' : 'apps'} from the homepage. That's normal for a hardened or heavily customised setup.</p>
          {/if}
        </div>
      </section>
    {/if}

    <!-- Performance -->
    <section class="band" id="c-vitals">
      <div class="frame sec compact">
        <div class="sec-head">
          <div><div class="sec-num"></div><h2 class="sec-title">Performance</h2></div>
          <p class="sec-desc">Google PageSpeed Insights, mobile profile, with real-user Chrome data where available.</p>
        </div>
        {#if report.performance}
          {@const p = report.performance}
          <div class="row" style="margin-bottom: 20px"><span class="chip {needsWork ? 'orange' : 'green'}">{needsWork ? `${needsWork} of ${vitalRows.length} need work` : 'All good'}</span></div>
          <div class="vitals">
            {#each vitalRows as v (v.metric)}
              <div class="vital" title={METRIC[v.metric].t}>
                <div class="n"><span>{METRIC[v.metric].n}</span><span class="chip {verdictChip[v.verdict].c}">{verdictChip[v.verdict].t}</span></div>
                <div class="big">{fmtMetric(v.metric, v.value)}</div>
                <div class="bar"><i class={verdictChip[v.verdict].b} style="width: {barPct(v.metric, v.value)}%"></i></div>
                <div class="t">Target &lt; {fmtTarget(v.metric)} · {v.source === 'field' ? 'real users' : 'lab'}</div>
              </div>
            {/each}
          </div>
          <div class="lh">
            <div><b>{p.scores.performance ?? '—'}</b>Performance</div>
            <div><b>{p.scores.accessibility ?? '—'}</b>Accessibility</div>
            <div><b>{p.scores.bestPractices ?? '—'}</b>Best practices</div>
            <div><b>{p.scores.seo ?? '—'}</b>SEO</div>
          </div>
          {#if p.totalBytes}
            <div class="payload">
              <span>Wire payload <b>{fmtBytes(p.totalBytes)}</b>{#if p.requestCount} across <b>{p.requestCount}</b> requests{/if}</span>
              {#if p.breakdown}
                {@const b = p.breakdown}
                <span>JS <b>{fmtBytes(b.scriptBytes)}</b></span><span>Images <b>{fmtBytes(b.imageBytes)}</b></span><span>Fonts <b>{fmtBytes(b.fontBytes)}</b></span><span>CSS <b>{fmtBytes(b.stylesheetBytes)}</b></span>{#if b.thirdPartyBytes !== null}<span>Third-party <b>{fmtBytes(b.thirdPartyBytes)}</b></span>{/if}
              {/if}
            </div>
          {/if}
          {#if p.accessibilityIssues.length}
            <div class="acc" style="margin-top: 24px">
              <details open={printMode}>
                <summary>{p.accessibilityIssues.length} accessibility issue{p.accessibilityIssues.length === 1 ? '' : 's'} flagged by Lighthouse</summary>
                <div class="ans flush">
                  <div class="frows">
                    {#each p.accessibilityIssues.slice(0, 8) as a (a.id)}
                      <div class="frow" style="grid-template-columns: 76px minmax(0, 1fr)"><span class="chip st warn">A11y</span><div class="name">{a.title}<span class="cd" style="font-family: var(--font-ui)">{a.count} element{a.count === 1 ? '' : 's'}</span></div></div>
                    {/each}
                  </div>
                  <p class="note-s">Automated checks find only part of the accessibility picture.</p>
                </div>
              </details>
            </div>
          {/if}
        {:else}
          <div class="row"><span class="chip">Not measured</span><span class="muted">Performance data is not available for this scan{running ? ' yet' : ''}.</span></div>
        {/if}
      </div>
    </section>

    <!-- Security headers -->
    <section class="band" id="c-headers">
      <div class="frame sec compact">
        <div class="sec-head">
          <div><div class="sec-num"></div><h2 class="sec-title">Security headers</h2></div>
          <p class="sec-desc">{#if report.profile && !report.profile.interactive}Directives on the homepage response. Browser-isolation headers (CSP, clickjacking, COOP) protect logins and sessions; this site has none, so they are listed as low impact and not scored.{:else}Directives on the homepage response. "Warn" items are hardening opportunities, not proof of a vulnerability.{/if}</p>
        </div>
        <Findings findings={headerFindings} codes={HEADER_CODES} open={printMode} empty="No page response to assess." />
        {#if report.cookies.length}
          <div class="acc" style="margin-top: 16px">
            <details open={printMode}>
              <summary>{report.cookies.length} cookie{report.cookies.length === 1 ? '' : 's'} set on arrival</summary>
              <div class="ans flush"><div class="tbox"><div class="tw"><table class="table compact">
                <thead><tr><th>Name</th><th>Set by</th><th>Secure</th><th>HttpOnly</th><th>SameSite</th><th>Lasts</th></tr></thead>
                <tbody>{#each report.cookies as c}<tr><td class="mono">{c.name}</td><td class="mono">{c.domain}{c.thirdParty ? ' (third party)' : ''}</td><td>{c.secure ? 'Yes' : 'No'}</td><td>{c.httpOnly ? 'Yes' : 'No'}</td><td>{c.sameSite ?? '—'}</td><td>{c.session ? 'This visit' : 'Persists'}</td></tr>{/each}</tbody>
              </table></div></div></div>
            </details>
          </div>
        {/if}
      </div>
    </section>

    <!-- HTTPS & certificate -->
    <section class="band" id="c-tls">
      <div class="frame sec compact">
        <div class="sec-head">
          <div><div class="sec-num"></div><h2 class="sec-title">HTTPS &amp; certificate</h2></div>
          <p class="sec-desc">{report.tls?.source === 'handshake' ? 'TLS handshake and trust path to a public root.' : report.cert ? 'From Certificate Transparency logs; the handshake could not be completed.' : 'No certificate information available.'}</p>
        </div>
        {#if chain.length}
          <div class="chain">
            {#each chain as c, i (i)}
              {@const leaf = c.role === 'Leaf'}
              {@const cls = leaf ? (!certOk || (certDays !== null && certDays < 0) ? 'fail' : certDays !== null && certDays < 21 ? 'warn' : '') : ''}
              <div class="l">
                <span class="ic {cls}" aria-hidden="true">{#if cls === 'fail'}<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="m4 4 8 8M12 4l-8 8" /></svg>{:else}<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m3.5 8.5 3 3 6-7" /></svg>{/if}</span>
                <div>
                  <b><span class="role">{c.role}</span>{c.subject ?? 'Unknown'}</b>
                  {#if leaf}
                    <span class="d {cls === 'fail' ? 'bad-t' : cls === 'warn' ? 'warn-t' : 'ok-t'}">{dot(!certOk ? (report.tls?.authorizationError ?? 'Not trusted') : certDays !== null ? (certDays < 0 ? `Expired ${-certDays} days ago` : `Valid (${certDays} days remaining)`) : 'Valid', report.tls?.cipher ?? null)}</span>
                    <span class="d">{dot(c.keyType ? `${c.keyType} ${c.curve ?? c.keyBits ?? ''}`.trim() : null, c.issuer ? `Issued by ${c.issuer}` : null, report.cert?.sans.length ? `Covers ${report.cert.sans.length} name${report.cert.sans.length === 1 ? '' : 's'}` : null)}</span>
                  {:else}
                    <span class="d">{dot(c.keyType ? `${c.keyType} ${c.curve ?? c.keyBits ?? ''}`.trim() : null, c.selfSigned ? 'Self-signed trust anchor' : c.issuer ? `Signed by ${c.issuer}` : null, c.notAfter ? `Expires ${fmtDate(c.notAfter)}` : null)}</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
        {#if chain.length === 1 && report.tls?.source === 'handshake' && !certOk}<p class="note-s">Only the site certificate was sent; the intermediate that links it to {report.cert?.issuer ?? 'the issuer'} is missing from the server's configuration.</p>{/if}
        {#if tlsFindings.length}<div style="margin-top: 28px"><Findings findings={tlsFindings} open={printMode} /></div>{/if}
      </div>
    </section>

    <!-- SEO -->
    <section class="band" id="c-seo">
      <div class="frame sec compact">
        <div class="sec-head">
          <div><div class="sec-num"></div><h2 class="sec-title">SEO &amp; meta tags</h2></div>
          <p class="sec-desc">Homepage metadata and crawl configuration.{#if !running && sectionScore('seo') === null && sectionNote('seo')}&nbsp;{sectionNote('seo')} Not scored.{/if}</p>
        </div>
        {#if report.seo}
          <Findings findings={report.seo.findings} codes={SEO_CODES} values={seoValues} open={printMode} />
          <div class="acc" style="margin-top: 16px">
            <details open={printMode}>
              <summary>Page details</summary>
              <div class="ans flush">
                <dl class="dlx">
                  <dt>Headings</dt><dd>{Object.entries(report.seo.headingCounts).filter(([, v]) => v).map(([k, v]) => `${k.toUpperCase()}: ${v}`).join(' · ') || '—'}</dd>
                  <dt>Links</dt><dd>{report.seo.links.internal} internal · {report.seo.links.external} external</dd>
                  <dt>Images without alt text</dt><dd>{report.seo.images.missingAlt} of {report.seo.images.total}</dd>
                  {#if report.seo.hreflang.length}<dt>Languages (hreflang)</dt><dd>{report.seo.hreflang.slice(0, 10).join(', ')}</dd>{/if}
                  {#if report.robots}<dt>AI crawlers</dt><dd>{#if report.robots.aiCrawlers.some((a) => a.blocked)}Blocked: {report.robots.aiCrawlers.filter((a) => a.blocked).map((a) => a.agent).join(', ')}{:else}All allowed (no AI-specific rules){/if}</dd>{/if}
                  <dt>Well-known files</dt><dd>{[report.wellKnown.securityTxt && 'security.txt', report.wellKnown.adsTxt && 'ads.txt', report.wellKnown.llmsTxt && 'llms.txt'].filter(Boolean).join(', ') || 'None found'}</dd>
                </dl>
              </div>
            </details>
          </div>
        {:else}<p class="note-s" style="margin-top: 0">No page to assess.</p>{/if}
      </div>
    </section>

    <!-- Email -->
    <section class="band" id="c-email">
      <div class="frame sec compact">
        <div class="sec-head">
          <div><div class="sec-num"></div><h2 class="sec-title">Email protection</h2></div>
          <p class="sec-desc">Whether others can send email pretending to be this domain.{#if !running && sectionScore('email') === null && sectionNote('email')}&nbsp;{sectionNote('email')} Not scored.{/if}</p>
        </div>
        <Findings findings={report.email} open={printMode} empty="DNS could not be read for this domain." />
      </div>
    </section>

    <!-- Hosting & DNS -->
    <section class="band" id="c-hosting">
      <div class="frame sec compact">
        <div class="sec-head">
          <div><div class="sec-num"></div><h2 class="sec-title">Hosting &amp; DNS</h2></div>
          <p class="sec-desc">A CDN in front of a site hides where it's really hosted. We only name a host when there's evidence for it.</p>
        </div>
        <dl class="dlx">
          <dt>CDN / reverse proxy</dt><dd>{report.infra.cdn?.name ?? 'None seen'}</dd>
          <dt>Firewall / bot protection</dt>
          <dd>{#if report.infra.waf}{report.infra.waf.name}{#if report.infra.waf.evidence.length === 1 && report.infra.waf.evidence[0]?.source === 'implied'}<span class="sub">{report.infra.waf.evidence[0].value}</span>{/if}{:else}None seen{/if}</dd>
          <dt>Hosting provider</dt>
          <dd>{#if report.infra.hosting}{report.infra.hosting.name} <span class="chip {confChip[report.infra.hosting.confidence]}" style="margin-left: 4px">{confWord[report.infra.hosting.confidence]}</span>{:else if report.infra.cdn}<b style="font-weight: 500">Not publicly visible.</b> The site is served through {report.infra.cdn.name}, which hides the real server.{:else}Unknown{/if}</dd>
          <dt>Web server software</dt><dd>{serverLine}</dd>
          {#if report.infra.ips.length}
            <dt>IP addresses</dt>
            <dd>
              {#each ipGroups as g (g.label)}
                <div class="ipgroup">{g.ips.length} address{g.ips.length === 1 ? '' : 'es'} · {g.label}<span class="sub mono">{dot(g.ips.find((i) => i.version === 4)?.ip, g.ips.find((i) => i.version === 6)?.ip, g.ips.length > 2 ? `+${g.ips.length - 2} more` : null)}</span></div>
              {/each}
            </dd>
          {/if}
          <dt>DNS provider</dt><dd>{report.infra.dnsProvider?.name ?? '—'}</dd>
          {#if report.external.greenHosting}<dt>Green hosting</dt><dd>{report.external.greenHosting.green ? `Yes: ${report.external.greenHosting.hostedBy ?? 'listed by the Green Web Foundation'}` : 'Not listed by the Green Web Foundation'}</dd>{/if}
          {#if report.domain?.status.length}<dt>Domain status</dt><dd>{report.domain.status.join(', ')}</dd>{/if}
        </dl>
        <div class="acc" style="margin-top: 24px">
          {#if report.infra.ips.length > 2}
            <details open={printMode}>
              <summary>All {report.infra.ips.length} IP addresses</summary>
              <div class="ans flush"><div class="tbox"><div class="tw"><table class="table compact"><tbody>{#each report.infra.ips as ip (ip.ip)}<tr><td class="mono">{ipLine(ip)}</td></tr>{/each}</tbody></table></div></div></div>
            </details>
          {/if}
          {#if (report.http?.chain && report.http.chain.length > 1) || Object.keys(report.http?.cacheHeaders ?? {}).length}
            <details open={printMode}>
              <summary>Response details: redirects and caching</summary>
              <div class="ans flush">
                <dl class="dlx">
                  {#if report.http?.chain && report.http.chain.length > 1}<dt>Redirects</dt><dd>{#each report.http.chain as hop}<div class="mono">{hop.location ? `${hop.status} ${hop.url} → ${hop.location}` : `${hop.status} ${hop.url}`}</div>{/each}</dd>{/if}
                  {#if Object.keys(report.http?.cacheHeaders ?? {}).length}<dt>Caching</dt><dd>{#each Object.entries(report.http?.cacheHeaders ?? {}) as [k, v]}<div class="mono">{k}: {v}</div>{/each}</dd>{/if}
                </dl>
              </div>
            </details>
          {/if}
          {#if report.dns}
            {@const dnsCount = report.dns.A.length + report.dns.AAAA.length + report.dns.CNAME.length + report.dns.NS.length + report.dns.MX.length + report.dns.TXT.length + report.dns.CAA.length}
            <details open={printMode}>
              <summary>{dnsCount} DNS records</summary>
              <div class="ans flush"><div class="tbox"><div class="tw"><table class="table compact">
                <thead><tr><th style="width: 80px">Type</th><th>Value</th></tr></thead>
                <tbody>
                  {#each report.dns.A as v}<tr><td class="mono">A</td><td class="mono wrapany">{v}</td></tr>{/each}
                  {#each report.dns.AAAA as v}<tr><td class="mono">AAAA</td><td class="mono wrapany">{v}</td></tr>{/each}
                  {#each report.dns.CNAME as v}<tr><td class="mono">CNAME</td><td class="mono wrapany">{v}</td></tr>{/each}
                  {#each report.dns.NS as v}<tr><td class="mono">NS</td><td class="mono wrapany">{v}</td></tr>{/each}
                  {#each report.dns.MX as v}<tr><td class="mono">MX</td><td class="mono wrapany">{v.priority} {v.exchange}</td></tr>{/each}
                  {#each report.dns.CAA as v}<tr><td class="mono">CAA</td><td class="mono wrapany">{v}</td></tr>{/each}
                  {#each report.dns.TXT as v}<tr><td class="mono">TXT</td><td class="mono wrapany">{v}</td></tr>{/each}
                </tbody>
              </table></div></div></div>
            </details>
          {/if}
        </div>
      </div>
    </section>

    <!-- Subdomains -->
    <section class="band" id="c-subdomains">
      <div class="frame sec compact">
        <div class="sec-head">
          <div><div class="sec-num"></div><h2 class="sec-title">Subdomains</h2></div>
          <p class="sec-desc">Hostnames under {report.target.registrableDomain} that have had a TLS certificate issued, from public Certificate Transparency logs. Nothing was probed; some may no longer exist.</p>
        </div>
        {#if subs}
          <div class="subtools">
            <span class="chip">{subs.total} found{#if subs.total > subs.names.length} · showing first {subs.names.length}{/if}</span>
            {#if subs.names.length > 12}<input type="search" class="input sm filter no-print" placeholder="Filter subdomains…" bind:value={subFilter} aria-label="Filter subdomains" />{/if}
          </div>
          {#if subs.names.length}
            <div class="subs">
              {#each subsShown as n (n)}<span class="tag">{n}</span>{:else}<span class="muted">Nothing matches that filter.</span>{/each}
            </div>
          {:else}
            <p class="note-s" style="margin-top: 0">No other hostnames appear in Certificate Transparency logs for this domain.</p>
          {/if}
        {:else if running}
          <div class="row"><span class="spinner" aria-hidden="true"></span><span class="muted">Querying Certificate Transparency logs…</span></div>
        {:else}
          <div class="alert warn">{@render warnIcon()}<div><b>Subdomains unavailable for this scan.</b> The Certificate Transparency source (crt.sh) did not answer in time, or external lookups are switched off. <a class="a ink" href="/v2?url={encodeURIComponent(data.scan.url)}">Scan again</a> to retry.</div></div>
        {/if}
      </div>
    </section>

    <!-- Privacy -->
    <section class="band" id="c-privacy">
      <div class="frame sec compact">
        <div class="sec-head">
          <div><div class="sec-num"></div><h2 class="sec-title">Privacy &amp; third parties</h2></div>
          <p class="sec-desc">Trackers, ad pixels, consent and everything the page loads from other companies.{#if !running && sectionScore('privacy') === null && sectionNote('privacy')}&nbsp;{sectionNote('privacy')} Not scored.{/if}</p>
        </div>
        {#if failed}<p class="note-s" style="margin-top: 0">No page was loaded, so trackers and third-party requests could not be assessed.</p>{:else if report.privacy.length}<Findings findings={report.privacy} open={printMode} />{/if}
        {#if report.thirdParties.length}
          <div class="acc" style="margin-top: 16px">
            <details open={printMode}>
              <summary>{report.thirdParties.length} third-party domain{report.thirdParties.length === 1 ? '' : 's'}</summary>
              <div class="ans flush"><div class="tbox"><div class="tw"><table class="table compact">
                <thead><tr><th>Service</th><th>Purpose</th><th>Domain</th><th class="num">Requests</th></tr></thead>
                <tbody>{#each report.thirdParties as t (t.domain)}<tr><td>{t.technology ?? `Unknown (${t.domain.split('.').slice(-2).join('.')})`}</td><td class="k">{t.category ?? '—'}</td><td class="mono wrapany">{t.domain}</td><td class="num">{t.count}</td></tr>{/each}</tbody>
              </table></div></div></div>
            </details>
          </div>
        {/if}
      </div>
    </section>
  </div>

  <section class="band">
    <div class="frame" style="padding-block: 24px">
      <p class="spec">{dot(`Scanner ${report.scan.scannerVersion}`, report.scan.fingerprintsVersion ? `fingerprints ${report.scan.fingerprintsVersion}` : null, `report v${report.reportVersion}`)}</p>
    </div>
  </section>
{/if}
