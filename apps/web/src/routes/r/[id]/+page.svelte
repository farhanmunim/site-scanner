<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import type { Finding, IpInfo, Report, StageMeta, StageName, TechnologyDetection, CertChainEntry, SectionScore } from '@site-scanner/core/types';
  import { CWV_THRESHOLDS, scoreTone, vitals } from '@site-scanner/core/analyze/score';
  import { PROFILE_LABELS } from '@site-scanner/core/analyze/profile';
  import { explainFailure } from '@site-scanner/core/analyze/reasons';
  import Badge from '$lib/components/Badge.svelte';
  import FindingsTable from '$lib/components/FindingsTable.svelte';
  import FindingsList from '$lib/components/FindingsList.svelte';
  import ScanLog from '$lib/components/ScanLog.svelte';
  import Section from '$lib/components/Section.svelte';
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
  let shotOpen = $state(false);

  onMount(() => {
    if (printMode) {
      document.documentElement.setAttribute('data-theme', 'light');
      document.body.classList.add('print-mode');
      for (const d of document.querySelectorAll('details')) d.open = true;
    }
    // A hash link into a collapsed section or dropdown (e.g. #hsts) should open it.
    const reveal = () => {
      const id = location.hash.slice(1);
      const el = id && document.getElementById(id);
      if (!el) return;
      let d = el instanceof HTMLDetailsElement ? el : el.closest('details');
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
  const confWord = { high: 'certain', medium: 'likely', low: 'possible' } as const;
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
  const TLS_IDS = new Set(['https', 'https-redirect', 'tls-cert', 'tls-chain', 'tls-expiry', 'tls-version', 'hsts']);
  const typeLabel = (t: TechnologyDetection) => (/ DNS$/.test(t.name) ? 'DNS provider' : t.categories.map((c) => c.name).join(', '));
  const ipLine = (ip: IpInfo) => dot(ip.ip, ip.asn ? `AS${ip.asn}${ip.asnOrg ? ` ${ip.asnOrg}` : ''}` : null, ip.country, ip.reverseDns);
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
  const METRIC = { lcpMs: { n: 'Largest Contentful Paint', s: 'LCP' }, cls: { n: 'Layout shift', s: 'CLS' }, inpMs: { n: 'Interaction delay', s: 'INP' }, tbtMs: { n: 'Blocking time', s: 'TBT' }, ttfbMs: { n: 'Server response', s: 'TTFB' } } as const;
  const fmtMetric = (m: keyof typeof CWV_THRESHOLDS, v: number) => (m === 'cls' ? v.toFixed(2) : v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`);
  const fmtTarget = (m: keyof typeof CWV_THRESHOLDS) => (m === 'cls' ? CWV_THRESHOLDS[m][0].toFixed(2) : CWV_THRESHOLDS[m][0] >= 1000 ? `${(CWV_THRESHOLDS[m][0] / 1000).toFixed(1)}s` : `${CWV_THRESHOLDS[m][0]}ms`);
  /** Position on a threshold track that spans 0 → 1.5× the "poor" threshold. */
  const track = (m: keyof typeof CWV_THRESHOLDS, v: number) => {
    const [good, poor] = CWV_THRESHOLDS[m];
    const max = poor * 1.5;
    return { p1: `${Math.round((good / max) * 100)}%`, p2: `${Math.round((poor / max) * 100)}%`, pos: `${Math.min(98, Math.max(2, Math.round((v / max) * 100)))}%` };
  };
  const verdictClass = { good: '', 'needs-work': 'a', poor: 'r' } as const;
  const toneOf = (score: number | null): 'g' | 'a' | 'r' | 'n' => (score === null ? 'n' : ({ green: 'g', amber: 'a', red: 'r', grey: 'n' } as const)[scoreTone(score)]);
  const toneWord = (score: number | null) => (score === null ? 'Not scored' : score === 100 ? 'Pass' : scoreTone(score) === 'green' ? 'Good' : scoreTone(score) === 'amber' ? 'Needs work' : 'Poor');

  // ---------- derived ----------
  let scores = $derived(report?.scores ?? null);
  let failed = $derived(!running && report?.scan.quality === 'failed');
  let failureReason = $derived(failed ? explainFailure(report?.stages?.http?.note ?? scanError) : null);
  let overall = $derived(!running && scores?.overall != null ? scores.overall : null);
  let tone = $derived(scoreTone(overall));
  let section = (id: string): SectionScore | null => scores?.sections.find((s) => s.id === id) ?? null;
  let sectionScore = (id: string) => (running ? null : (section(id)?.score ?? null));
  let headerFindings = $derived((report?.security ?? []).filter((f) => !TLS_IDS.has(f.id)));
  let tlsFindings = $derived((report?.security ?? []).filter((f) => TLS_IDS.has(f.id)));
  let techFilter = $state('');
  let headerFilter = $state('');
  let techs = $derived((report?.technologies ?? []).filter((t) => !techFilter || t.name.toLowerCase().includes(techFilter.toLowerCase()) || t.categories.some((c) => c.name.toLowerCase().includes(techFilter.toLowerCase()))));
  let anyVersion = $derived((report?.technologies ?? []).some((t) => t.version));
  const notBuiltWith = /^(Webmail|Hosting|CDN|Miscellaneous|Email|Security|PaaS|IaaS|Reverse proxies|Load balancers|SSL\/TLS certificate authorities|Domain parking|Web servers)$/;
  /** Every technology as a chip; implied and low-confidence ones drawn dimmer. */
  let chips = $derived([...(report?.technologies ?? [])].sort((a, b) => Number(!!a.implied) - Number(!!b.implied) || (a.confidence === 'low' ? 1 : 0) - (b.confidence === 'low' ? 1 : 0)));
  let builtWith = $derived((report?.technologies ?? []).filter((t) => !t.implied && t.confidence !== 'low' && !t.categories.every((c) => notBuiltWith.test(c.name))).slice(0, 5));
  let platformName = $derived(report?.cms ? { wordpress: 'WordPress', shopify: 'Shopify', webflow: 'Webflow', wix: 'Wix', squarespace: 'Squarespace' }[report.cms.platform] : '');
  let themeLine = $derived(report?.cms?.theme ? dot(`${report.cms.theme.name ?? report.cms.theme.slug}${report.cms.theme.version ? ` ${report.cms.theme.version}` : ''}`, report.cms.theme.author ? `by ${report.cms.theme.author}` : null) : '');
  let chain = $derived.by((): (CertChainEntry & { role: string })[] => {
    const c = report?.tls?.chain ?? [];
    if (c.length) return [...c].reverse().map((e, i, arr) => ({ ...e, role: i === arr.length - 1 ? 'Site certificate' : e.selfSigned || i === 0 ? 'Root CA' : 'Intermediate' }));
    if (report?.cert) return [{ subject: report.cert.subject, issuer: report.cert.issuer, notBefore: report.cert.notBefore, notAfter: report.cert.notAfter, keyType: null, keyBits: null, curve: null, selfSigned: false, role: 'Site certificate' }];
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
  const attention = (list: Finding[]) => list.filter((f) => (f.status === 'bad' || f.status === 'warn') && f.relevance !== 'low');
  const sectionHref: Record<string, string> = { headers: '#c-headers', tls: '#c-tls', performance: '#c-vitals', seo: '#c-seo', email: '#c-email', privacy: '#c-privacy' };

  /** Every warning across every section, worst first: the one list a reader acts on. */
  type Fix = { href: string; title: string; observed: string; where: string; status: 'bad' | 'warn'; points: number };
  let fixes = $derived.by((): Fix[] => {
    if (!report || running) return [];
    const pts = new Map<string, number>();
    for (const s of scores?.sections ?? []) for (const p of s.penalties) pts.set(`${s.id}:${p.findingId}`, p.points);
    const out: Fix[] = [];
    const add = (list: Finding[], sec: string, where: string) => {
      for (const f of attention(list)) out.push({ href: `#${f.id}`, title: f.title, observed: f.observed, where, status: f.status as 'bad' | 'warn', points: pts.get(`${sec}:${f.id}`) ?? 0 });
    };
    add(headerFindings, 'headers', 'Security headers');
    add(tlsFindings, 'tls', 'HTTPS');
    add(report.seo?.findings ?? [], 'seo', 'SEO');
    add(report.email, 'email', 'Email');
    if (!failed) add(report.privacy, 'privacy', 'Privacy');
    if (report.cms?.flags) add(report.cms.flags, 'cms', platformName);
    for (const v of vitalRows) if (v.verdict !== 'good') out.push({ href: '#c-vitals', title: `${METRIC[v.metric].n} is ${v.verdict === 'poor' ? 'poor' : 'slow'}`, observed: `${fmtMetric(v.metric, v.value)} measured, target under ${fmtTarget(v.metric)}.`, where: 'Performance', status: v.verdict === 'poor' ? 'bad' : 'warn', points: v.verdict === 'poor' ? 12 : 6 });
    const a11y = report.performance?.accessibilityIssues.length ?? 0;
    if (a11y) out.push({ href: '#a11y', title: `${a11y} accessibility issue${a11y === 1 ? '' : 's'} flagged`, observed: report.performance!.accessibilityIssues.slice(0, 3).map((x) => x.title).join(' · '), where: 'Performance', status: 'warn', points: 4 });
    return out.sort((a, b) => Number(b.status === 'bad') - Number(a.status === 'bad') || b.points - a.points);
  });
  const impact = (f: Fix) => (f.status === 'bad' || f.points >= 15 ? 'High' : f.points >= 8 ? 'Medium' : 'Low');

  /** Scored categories, worst first; doubles as the section nav. */
  let board = $derived.by(() => {
    const ids = ['performance', 'headers', 'tls', 'seo', 'email', 'privacy'];
    return ids
      .map((id) => section(id))
      .filter((s): s is SectionScore => !!s)
      .map((s) => ({ id: s.id, href: sectionHref[s.id]!, label: s.label, score: running ? null : s.score, note: s.note }))
      .sort((a, b) => (a.score === null ? 101 : a.score) - (b.score === null ? 101 : b.score));
  });
  let otherNav = $derived([
    { href: '#c-facts', label: 'Key facts', value: report?.profile ? PROFILE_LABELS[report.profile.kind] : '' },
    { href: '#c-stack', label: 'Technology', value: `${report?.technologies.length ?? 0} found` },
    ...(report?.cms ? [{ href: '#c-cms', label: platformName, value: report.cms.plugins.length ? `${report.cms.plugins.length} plugins` : '' }] : []),
    { href: '#c-hosting', label: 'Hosting & DNS', value: report?.infra.cdn?.name ?? report?.infra.hosting?.name ?? '' },
    ...(report?.external.subdomains ? [{ href: '#c-subdomains', label: 'Subdomains', value: `${report.external.subdomains.total} found` }] : [])
  ]);

  /** Section header status: "2 to fix" / "All clear" / "Not scored". */
  const secStatus = (list: Finding[], id: string): { status: string; tone: 'g' | 'a' | 'r' | 'n'; open: boolean } => {
    if (running) return { status: '', tone: 'n', open: true };
    const att = attention(list);
    if (att.length) return { status: `${att.length} to fix`, tone: att.some((f) => f.status === 'bad') ? 'r' : 'a', open: true };
    const sc = sectionScore(id);
    if (sc === null) return { status: list.length ? 'For information' : 'Not scored', tone: 'n', open: false };
    return { status: 'All clear', tone: 'g', open: false };
  };
  let stHeaders = $derived(secStatus(headerFindings, 'headers'));
  let stTls = $derived(secStatus(tlsFindings, 'tls'));
  let stSeo = $derived(secStatus(report?.seo?.findings ?? [], 'seo'));
  let stEmail = $derived(secStatus(report?.email ?? [], 'email'));
  let stPrivacy = $derived(secStatus(failed ? [] : (report?.privacy ?? []), 'privacy'));
  let stPerf = $derived.by((): { status: string; tone: 'g' | 'a' | 'r' | 'n'; open: boolean } => {
    if (running) return { status: '', tone: 'n', open: true };
    if (!report?.performance) return { status: 'Not measured', tone: 'n', open: false };
    const a11y = report.performance.accessibilityIssues.length;
    if (needsWork) return { status: `${needsWork} of ${vitalRows.length} need work`, tone: vitalRows.some((v) => v.verdict === 'poor') ? 'r' : 'a', open: true };
    if (a11y) return { status: `${a11y} accessibility issue${a11y === 1 ? '' : 's'}`, tone: 'a', open: true };
    return { status: 'All good', tone: 'g', open: false };
  });
  let stCms = $derived(report?.cms ? secStatus(report.cms.flags, 'cms') : null);
  let tlsLine = $derived.by(() => {
    if (!report?.tls && !report?.cert) return [];
    const parts: { t: string; c?: string }[] = [];
    if (report?.tls?.protocol) parts.push({ t: certOk ? 'Valid' : 'Not valid', c: certOk ? 'g' : 'r' });
    if (certDays !== null) parts.push({ t: certDays < 0 ? `Expired ${-certDays} days ago` : `${certDays} days left`, c: certDays < 7 ? 'r' : certDays < 21 ? 'a' : undefined });
    if (report?.cert?.issuer) parts.push({ t: report.cert.issuer });
    if (report?.tls?.protocol) parts.push({ t: report.tls.protocol.replace('TLSv', 'TLS ') });
    if (report?.tls?.alpn === 'h2') parts.push({ t: 'HTTP/2' });
    if (report?.http?.http3) parts.push({ t: 'HTTP/3' });
    return parts;
  });
  let httpBadge = $derived.by(() => {
    const st = report?.http?.status ?? null;
    if (st === null) return { c: 'neutral', t: 'No response' } as const;
    return { c: st < 400 ? 'pass' : 'fail', t: `HTTP ${st}` } as const;
  });

  // ---------- actions ----------
  let shareLabel = $state('Share');
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: `${data.scan.displayHost} — website report`, url: location.href });
        return;
      }
      await navigator.clipboard.writeText(location.href);
      shareLabel = 'Link copied';
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
{#if failed}
  <p class="alert alert-fail" role="alert"><strong>We couldn't load this page:</strong> {failureReason}. DNS, registration, certificate and email checks still ran; nothing that needs the page could be assessed, so the site is not scored.</p>
{/if}
{#if report && (report.http?.challenge || report.scan.quality === 'restricted')}
  <p class="alert alert-warn">This website blocks automated visitors{report.http?.challenge ? ` (${report.http.challenge.vendor})` : ''}, so page-based checks are limited. Domain, DNS and certificate information was still collected.</p>
{/if}

<!-- ===== Identity row ===== -->
<header class="identity">
  {#if report?.screenshot}
    <button class="thumb" type="button" onclick={() => (shotOpen = !shotOpen)} aria-expanded={shotOpen} aria-label="{shotOpen ? 'Hide' : 'Show'} the full screenshot"><img src={'url' in report.screenshot ? report.screenshot.url : report.screenshot.dataUrl} alt="Screenshot of {data.scan.displayHost}" /></button>
  {:else}
    <div class="glyph" aria-hidden="true">{data.scan.displayHost[0]}</div>
  {/if}
  <div class="who">
    <p class="print-only meta" style="margin-bottom: 4px">Website report · {fmtDate(data.scan.createdAt)} · {data.siteHost}</p>
    <h1 class="turl"><a href={report?.http?.finalUrl ?? data.scan.url} rel="noopener nofollow" target="_blank">{data.scan.displayHost}</a></h1>
    <div class="tmeta">
      <span>Scanned {fmtDate(data.scan.createdAt)}</span>
      {#if report?.profile}<span aria-hidden="true">·</span><span title={report.profile.signals.join(' · ')}>{PROFILE_LABELS[report.profile.kind]}</span>{/if}
      {#if report && report.http?.status !== undefined && report.http?.status !== null && report.http.status >= 400}<Badge status={httpBadge.c} label={httpBadge.t} />{/if}
      {#if status !== 'complete'}<Badge status={status === 'failed' ? 'fail' : running ? 'info' : 'warn'} label={statusText[status] ?? status} force />{/if}
    </div>
  </div>
  <div class="tactions no-print">
    <button class="btn btn-primary" type="button" onclick={share}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" /></svg>{shareLabel}</button>
    <details class="menu">
      <summary class="btn btn-outline" aria-label="More actions" title="More actions"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg></summary>
      <div class="menu-list">
        <a href="/?url={encodeURIComponent(data.scan.url)}" title="Runs a fresh scan if the cached result is older than 15 minutes">Scan again</a>
        {#if !running}<button type="button" onclick={downloadPdf} disabled={pdfState === 'preparing'} aria-live="polite">{pdfState === 'preparing' ? 'Preparing PDF…' : pdfState === 'error' ? 'PDF failed, retry' : 'Download PDF'}</button>{/if}
        <a href="/api/scans/{data.scan.id}" rel="nofollow">View JSON</a>
        <a href="/">Scan another site</a>
      </div>
    </details>
  </div>
</header>
{#if shotOpen && report?.screenshot}
  <div class="shot-full">{#if 'url' in report.screenshot}<a href={report.screenshot.url} target="_blank" rel="noopener"><img src={report.screenshot.url} alt="Full screenshot of {data.scan.displayHost}" width={report.screenshot.width} height={report.screenshot.height} /></a>{:else}<img src={report.screenshot.dataUrl} alt="Full screenshot of {data.scan.displayHost}" />{/if}</div>
{/if}

{#if running || !report || failed}
  <div class="card" style="margin-bottom: 20px">
    <div class="card-h"><div><div class="card-title">{running ? 'Running scan' : 'Scan log'}</div><div class="card-sub">{running ? 'Usually 10–40 seconds. Results fill in below as each step finishes.' : failed ? 'Which steps ran and where the page fetch stopped.' : (scanError ?? 'The scan produced no data.')}</div></div></div>
    <div class="card-body"><ScanLog host={data.scan.displayHost} {stages} {status} /></div>
    {#if scanError && !running && !failed}<p class="note fail">{scanError}</p>{/if}
  </div>
{/if}

{#if report}
  <div class="split">
    <aside class="left">
      <!-- verdict -->
      <div class="card verdict">
        {#if overall !== null && scores}
          <div class="big"><span class="grade {tone}">{scores.grade}</span><span class="score"><b>{overall}</b> / 100</span></div>
          <p class="lead">{scores.summary}</p>
        {:else}
          <div class="big"><span class="grade grey">–</span><span class="score">{running ? 'Scoring…' : 'Not scored'}</span></div>
          <p class="lead muted">{running ? 'The grade is calculated once every step has finished.' : (scores?.summary ?? 'Not enough data was collected to score this site.')}</p>
        {/if}
      </div>

      <!-- priority fixes -->
      {#if !running}
        <div class="card fixes">
          <div class="card-h"><div><div class="card-title">Priority fixes</div></div>{#if fixes.length}<span class="meta">{fixes.length} item{fixes.length === 1 ? '' : 's'}, worst first</span>{/if}</div>
          {#if fixes.length}
            <ol>
              {#each fixes as f (f.href + f.title)}
                <li><a href={f.href}><span class="dotc {f.status === 'bad' ? 'r' : ''}" aria-hidden="true"></span><span class="fx-title">{f.title}</span><span class="fx-obs">{f.observed}</span><span class="fx-sec">{f.where} · {impact(f)} impact</span></a></li>
              {/each}
            </ol>
          {:else}
            <p class="none">{failed ? 'Nothing could be assessed without the page.' : 'Nothing to fix. Keep the certificate, platform and dependencies current.'}</p>
          {/if}
        </div>
      {/if}

      <!-- scoreboard / nav -->
      <nav class="card board" aria-label="Report sections">
        <div class="lab">Scores</div>
        {#each board as b (b.id)}
          <a class="brow" href={b.href} title={b.note ?? undefined}>
            <b>{b.label}</b>
            <span class="bval {toneOf(b.score)}">{running ? '…' : b.score === null ? (b.id === 'performance' ? 'Not measured' : 'Not scored') : b.score === 100 ? 'Pass' : b.score}</span>
            <span class="bar" aria-hidden="true"><i class={b.score === null ? '' : scoreTone(b.score)} style="width: {b.score ?? 0}%"></i></span>
          </a>
        {/each}
        <div class="lab" style="margin-top: 6px">Facts</div>
        {#each otherNav as n (n.href)}
          <a class="chk" href={n.href}><b>{n.label}</b>{#if n.value}<span>{n.value}</span>{/if}</a>
        {/each}
      </nav>
    </aside>

    <div class="stream">
      <!-- ===== Key facts ===== -->
      <Section id="c-facts" title="Key facts" sub="The essentials. Hosting & DNS has the full detail." open allowBreak>
        <dl class="facts">
          <div><dt>Built with</dt><dd>{#if builtWith.length}<span class="tags">{#each builtWith as t (t.slug)}<a class="tag" href="#c-stack">{t.name}{t.version ? ` ${t.version}` : ''}</a>{/each}{#if report.technologies.length > builtWith.length}<a class="tag dim" href="#c-stack">+{report.technologies.length - builtWith.length} more</a>{/if}</span>{:else}<span class="muted">{failed ? 'Page could not be loaded' : 'Nothing identified with confidence'}</span>{/if}</dd></div>
          <div><dt>Hosted by</dt><dd>{#if report.infra.hosting}{report.infra.hosting.name}{#if report.infra.hosting.confidence !== 'high'}<span class="muted"> · {confWord[report.infra.hosting.confidence]}</span>{/if}{:else if report.infra.cdn}Hidden behind {report.infra.cdn.name}{:else}Unknown{/if}</dd></div>
          <div><dt>CDN / firewall</dt><dd>{dot(report.infra.cdn?.name ?? 'None seen', report.infra.waf && report.infra.waf.name !== report.infra.cdn?.name ? report.infra.waf.name : null)}</dd></div>
          {#if report.cms}<div><dt>Platform</dt><dd><a class="link" href="#c-cms">{platformName}{report.cms.version ? ` ${report.cms.version}` : ''}</a>{#if themeLine}<span class="muted"> · theme {themeLine}</span>{/if}</dd></div>{/if}
          {#if report.domain}<div><dt>Domain renews</dt><dd>{fmtDate(report.domain.expires)}{#if daysUntil(report.domain.expires) !== null}{@const d = daysUntil(report.domain.expires)!}<span class="st {d < 30 ? 'r' : d < 90 ? 'a' : 'n'}"> · {d} days</span>{/if}{#if report.domain.registrar}<span class="muted"> · {report.domain.registrar}</span>{/if}</dd></div>{/if}
          {#if report.cert?.notAfter}<div><dt>Certificate renews</dt><dd>{fmtDate(report.cert.notAfter)}{#if certDays !== null}<span class="st {certDays < 7 ? 'r' : certDays < 21 ? 'a' : 'n'}"> · {certDays} days</span>{/if}{#if report.cert.issuer}<span class="muted"> · {report.cert.issuer}</span>{/if}</dd></div>{/if}
          <div><dt>Third parties</dt><dd><a class="link" href="#c-privacy">{report.thirdParties.length} external service{report.thirdParties.length === 1 ? '' : 's'}</a>{#if report.privacy.find((f) => f.id === 'analytics')?.observed && !/^No /.test(report.privacy.find((f) => f.id === 'analytics')!.observed)}<span class="muted"> · {report.privacy.find((f) => f.id === 'analytics')!.observed}</span>{/if}</dd></div>
        </dl>
      </Section>

      <!-- ===== Technology ===== -->
      <Section id="c-stack" title="Technology stack" sub="Platform, CDN, analytics and third-party scripts identified from the page, headers and DNS." open={!!report.technologies.length || running} status={running ? '' : `${report.technologies.length} detected`} allowBreak>
        {#if chips.length}
          <div class="chips">
            {#each chips as t (t.slug)}
              <span class="tag" class:dim={t.implied || t.confidence === 'low'} title={dot(t.categories[0]?.name, t.implied ? 'implied' : confWord[t.confidence])}>{t.name}{#if t.version}<small>{t.version}</small>{/if}</span>
            {/each}
          </div>
          <details class="show-all" open={printMode}>
            <summary>Confidence and type for each</summary>
            <div class="toolbar in-card no-print"><input type="search" class="filter" placeholder="Filter…" bind:value={techFilter} aria-label="Filter technologies" /></div>
            <div class="table-wrap">
              <table class="table compact">
                <thead><tr><th>Name</th><th>Type</th><th>Confidence</th>{#if anyVersion}<th>Version</th>{/if}</tr></thead>
                <tbody>
                  {#each techs as t (t.slug)}
                    <tr><td>{#if t.website}<a href={t.website} rel="noopener nofollow" target="_blank">{t.name}</a>{:else}{t.name}{/if}</td><td class="muted">{typeLabel(t)}</td><td>{t.implied ? 'Implied' : confWord[t.confidence].replace(/^./, (c) => c.toUpperCase())}</td>{#if anyVersion}<td class="mono small">{t.version ?? '—'}</td>{/if}</tr>
                  {:else}
                    <tr><td colspan="4" class="muted">Nothing matches that filter.</td></tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </details>
        {:else}
          <p class="note">{failed ? 'The page could not be loaded, so nothing could be identified.' : running ? 'Identifying…' : "Nothing could be identified with confidence. That doesn't mean the site uses no framework; the public response didn't give enough away."}</p>
        {/if}
      </Section>

      <!-- ===== CMS ===== -->
      {#if report.cms && stCms}
        <Section id="c-cms" title={platformName} sub={report.cms.platform === 'wordpress' ? 'Version, theme and plugins visible from the homepage.' : 'Theme and apps visible from the homepage.'} open={stCms.open || !!report.cms.plugins.length} status={stCms.status || (report.cms.version ? `v${report.cms.version}` : '')} tone={stCms.tone} allowBreak>
          {#if report.cms.flags.length}<FindingsList findings={report.cms.flags} open={printMode} />{/if}
          {#if report.cms.theme || report.cms.plugins.length}
            <details class="show-all" open={printMode}>
              <summary>{[report.cms.theme ? 'Theme' : null, report.cms.plugins.length ? `${report.cms.plugins.length} ${report.cms.platform === 'wordpress' ? 'plugins' : 'apps'}` : null].filter(Boolean).join(' and ')}</summary>
              <div class="table-wrap">
                <table class="table compact">
                  <thead><tr><th>Component</th><th>Name</th><th>Version</th><th>Slug</th></tr></thead>
                  <tbody>
                    {#if report.cms.theme}<tr><td>Theme</td><td>{themeLine}</td><td class="mono small">{report.cms.theme.version ?? '—'}</td><td class="mono small">{report.cms.theme.slug}</td></tr>{/if}
                    {#each report.cms.plugins as p (p.slug)}<tr><td>{report.cms.platform === 'wordpress' ? 'Plugin' : 'App'}</td><td>{p.name ?? '—'}</td><td class="mono small">{p.version ?? '—'}</td><td class="mono small">{p.slug}</td></tr>{/each}
                  </tbody>
                </table>
              </div>
            </details>
          {:else}
            <p class="note">The site runs {platformName}, but it doesn't reveal its version, theme or {report.cms.platform === 'wordpress' ? 'plugins' : 'apps'} from the homepage. That's normal for a hardened or heavily customised setup.</p>
          {/if}
        </Section>
      {/if}

      <!-- ===== Performance ===== -->
      <Section id="c-vitals" title="Performance" sub={report.performance ? `Google PageSpeed Insights, mobile. Lighthouse performance ${report.performance.scores.performance ?? '—'} · accessibility ${report.performance.scores.accessibility ?? '—'} · best practices ${report.performance.scores.bestPractices ?? '—'} · SEO ${report.performance.scores.seo ?? '—'}.` : 'Google PageSpeed Insights, mobile profile.'} open={stPerf.open} status={stPerf.status} tone={stPerf.tone} score={sectionScore('performance')}>
        {#if report.performance}
          {@const p = report.performance}
          <div class="quad">
            {#each vitalRows as v (v.metric)}
              {@const t = track(v.metric, v.value)}
              <div class="vital">
                <div class="n">{METRIC[v.metric].n} <span class="muted">({METRIC[v.metric].s})</span></div>
                <div class="v {verdictClass[v.verdict]}">{fmtMetric(v.metric, v.value)}</div>
                <div class="thr" style="--p1: {t.p1}; --p2: {t.p2}; --pos: {t.pos}" role="img" aria-label="{v.verdict === 'good' ? 'Good' : v.verdict === 'poor' ? 'Poor' : 'Needs improvement'}; target under {fmtTarget(v.metric)}"><i class={verdictClass[v.verdict]}></i></div>
                <div class="e"><span>Target &lt; {fmtTarget(v.metric)}</span><span>{v.source === 'field' ? 'Real users' : 'Lab'}</span></div>
              </div>
            {/each}
          </div>
          {#if p.totalBytes}
            <div class="payload">
              <div class="lab">Page weight: {fmtBytes(p.totalBytes)}{#if p.requestCount}&nbsp;across {p.requestCount} requests{/if}</div>
              {#if p.breakdown}
                {@const b = p.breakdown}
                JavaScript <b>{fmtBytes(b.scriptBytes)}</b> · Images <b>{fmtBytes(b.imageBytes)}</b> · Fonts <b>{fmtBytes(b.fontBytes)}</b> · CSS <b>{fmtBytes(b.stylesheetBytes)}</b>{#if b.thirdPartyBytes !== null}&nbsp;· Third-party <b>{fmtBytes(b.thirdPartyBytes)}</b>{/if}
              {:else}
                <span class="muted">Breakdown by type was not reported for this run.</span>
              {/if}
            </div>
          {/if}
          {#if p.accessibilityIssues.length}
            <details class="show-all" id="a11y" open={printMode || !!p.accessibilityIssues.length}>
              <summary>{p.accessibilityIssues.length} accessibility issue{p.accessibilityIssues.length === 1 ? '' : 's'} flagged by Lighthouse</summary>
              <div class="findings">
                {#each p.accessibilityIssues.slice(0, 8) as a (a.id)}
                  <div class="finding"><Badge status="warn" /><div><h3>{a.title}</h3><div class="aff">{a.count} element{a.count === 1 ? '' : 's'}</div></div></div>
                {/each}
              </div>
              <p class="note">Automated checks find only part of the accessibility picture.</p>
            </details>
          {/if}
        {:else}
          <p class="note">Performance data is not available for this scan{running ? ' yet' : ''}.</p>
        {/if}
      </Section>

      <!-- ===== Security headers ===== -->
      <Section id="c-headers" title="Security headers" sub={report.profile && !report.profile.interactive ? 'Browser-isolation headers (CSP, clickjacking, COOP) protect logins and sessions; this site has none, so they are listed as low impact and not scored.' : 'Directives on the homepage response. Warnings are hardening opportunities, not proof of a vulnerability.'} open={stHeaders.open} status={stHeaders.status} tone={stHeaders.tone} score={sectionScore('headers')} allowBreak>
        {#if headerFindings.length > 6}<div class="toolbar in-card no-print"><input class="filter" placeholder="Filter directives…" aria-label="Filter directives" bind:value={headerFilter} /></div>{/if}
        <FindingsTable findings={headerFindings} codes={HEADER_CODES} filter={headerFilter} open={printMode} empty="No page response to assess." />
        {#if report.cookies.length}
          <details class="show-all" open={printMode}>
            <summary>{report.cookies.length} cookie{report.cookies.length === 1 ? '' : 's'} set on arrival</summary>
            <div class="table-wrap">
              <table class="table compact">
                <thead><tr><th>Name</th><th>Set by</th><th>Secure</th><th>HttpOnly</th><th>SameSite</th><th>Lasts</th></tr></thead>
                <tbody>{#each report.cookies as c}<tr><td class="mono small">{c.name}</td><td class="mono small">{c.domain}{c.thirdParty ? ' (third party)' : ''}</td><td>{c.secure ? 'Yes' : 'No'}</td><td>{c.httpOnly ? 'Yes' : 'No'}</td><td>{c.sameSite ?? '—'}</td><td>{c.session ? 'This visit' : 'Persists'}</td></tr>{/each}</tbody>
              </table>
            </div>
          </details>
        {/if}
      </Section>

      <!-- ===== HTTPS & certificate ===== -->
      <Section id="c-tls" title="HTTPS & certificate" sub={report.tls?.source === 'handshake' ? 'TLS handshake and trust path to a public root.' : report.cert ? 'From Certificate Transparency logs; the handshake could not be completed.' : 'No certificate information available.'} open={stTls.open || !certOk} status={stTls.status} tone={stTls.tone} score={sectionScore('tls')}>
        {#if tlsLine.length}
          <p class="tls-line">{#each tlsLine as part, i (i)}{#if i}<span class="sep" aria-hidden="true">·</span>{/if}<span class={part.c ? `st ${part.c}` : ''}>{part.t}</span>{/each}</p>
        {/if}
        {#if chain.length === 1 && report.tls?.source === 'handshake' && !certOk}<p class="note">Only the site certificate was sent; the intermediate that links it to {report.cert?.issuer ?? 'the issuer'} is missing from the server's configuration.</p>{/if}
        {#if tlsFindings.length}<FindingsList findings={tlsFindings} open={printMode} />{/if}
        {#if chain.length}
          <details class="show-all" open={printMode}>
            <summary>Certificate chain: {chain.length} certificate{chain.length === 1 ? '' : 's'}</summary>
            <div class="chain">
              {#each chain as c, i (i)}
                {@const leaf = c.role === 'Site certificate'}
                {@const cls = leaf ? (!certOk || (certDays !== null && certDays < 0) ? 'fail' : certDays !== null && certDays < 21 ? 'warn' : '') : ''}
                <div class="step">
                  <div class="step-ic {cls}" aria-hidden="true">{#if cls === 'fail'}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6 6 18M6 6l12 12" /></svg>{:else}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5" /></svg>{/if}</div>
                  <div>
                    <b>{c.role}: {c.subject ?? 'Unknown'}</b>
                    {#if leaf}
                      <span>{dot(!certOk ? (report.tls?.authorizationError ?? 'Not trusted') : null, c.keyType ? `${c.keyType} ${c.curve ?? c.keyBits ?? ''}`.trim() : null, report.tls?.cipher ?? null, c.issuer ? `Issued by ${c.issuer}` : null, report.cert?.sans.length ? `Covers ${report.cert.sans.length} name${report.cert.sans.length === 1 ? '' : 's'}` : null)}</span>
                    {:else}
                      <span>{dot(c.keyType ? `${c.keyType} ${c.curve ?? c.keyBits ?? ''}`.trim() : null, c.selfSigned ? 'Self-signed trust anchor' : c.issuer ? `Signed by ${c.issuer}` : null, c.notAfter ? `Expires ${fmtDate(c.notAfter)}` : null)}</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </details>
        {/if}
      </Section>

      <!-- ===== SEO ===== -->
      <Section id="c-seo" title="SEO & meta tags" sub="Homepage metadata and crawl configuration.{!running && sectionScore('seo') === null && section('seo')?.note ? ` ${section('seo')!.note}` : ''}" open={stSeo.open} status={stSeo.status} tone={stSeo.tone} score={sectionScore('seo')} allowBreak>
        {#if report.seo}
          <FindingsTable findings={report.seo.findings} codes={SEO_CODES} values={seoValues} open={printMode} />
          <details class="show-all" open={printMode}>
            <summary>Page details</summary>
            <div class="table-wrap">
              <table class="table kv compact kv-stack">
                <tbody>
                  <tr><td>Headings</td><td>{Object.entries(report.seo.headingCounts).filter(([, v]) => v).map(([k, v]) => `${k.toUpperCase()}: ${v}`).join(' · ') || '—'}</td></tr>
                  <tr><td>Links</td><td>{report.seo.links.internal} internal · {report.seo.links.external} external</td></tr>
                  <tr><td>Images without alt text</td><td>{report.seo.images.missingAlt} of {report.seo.images.total}</td></tr>
                  {#if report.seo.hreflang.length}<tr><td>Languages (hreflang)</td><td>{report.seo.hreflang.slice(0, 10).join(', ')}</td></tr>{/if}
                  {#if report.robots}<tr><td>AI crawlers</td><td>{#if report.robots.aiCrawlers.some((a) => a.blocked)}Blocked: {report.robots.aiCrawlers.filter((a) => a.blocked).map((a) => a.agent).join(', ')}{:else}All allowed (no AI-specific rules){/if}</td></tr>{/if}
                  <tr><td>Well-known files</td><td>{[report.wellKnown.securityTxt && 'security.txt', report.wellKnown.adsTxt && 'ads.txt', report.wellKnown.llmsTxt && 'llms.txt'].filter(Boolean).join(', ') || 'None found'}</td></tr>
                </tbody>
              </table>
            </div>
          </details>
        {:else}<p class="note">No page to assess.</p>{/if}
      </Section>

      <!-- ===== Email ===== -->
      <Section id="c-email" title="Email protection" sub="Whether others can send email pretending to be this domain.{!running && sectionScore('email') === null && section('email')?.note ? ` ${section('email')!.note}` : ''}" open={stEmail.open} status={stEmail.status} tone={stEmail.tone} score={sectionScore('email')} allowBreak>
        <FindingsList findings={report.email} open={printMode} empty="DNS could not be read for this domain." />
      </Section>

      <!-- ===== Hosting & DNS ===== -->
      <Section id="c-hosting" title="Hosting & DNS" sub="A CDN in front of a site hides where it's really hosted. We only name a host when there's evidence for it." open={false} status={report.infra.cdn?.name ?? report.infra.hosting?.name ?? ''} allowBreak>
        <div class="table-wrap">
          <table class="table kv compact kv-stack">
            <tbody>
              <tr><td>CDN / reverse proxy</td><td>{report.infra.cdn?.name ?? 'None seen'}</td></tr>
              <tr><td>Firewall / bot protection</td><td>{#if report.infra.waf}{report.infra.waf.name}{#if report.infra.waf.evidence.length === 1 && report.infra.waf.evidence[0]?.source === 'implied'}<div class="insight">{report.infra.waf.evidence[0].value}</div>{/if}{:else}None seen{/if}</td></tr>
              <tr><td>Hosting provider</td><td>{#if report.infra.hosting}{report.infra.hosting.name}<span class="muted"> · {confWord[report.infra.hosting.confidence]}</span>{:else if report.infra.cdn}<strong>Not publicly visible.</strong> The site is served through {report.infra.cdn.name}, which hides the real server.{:else}Unknown{/if}</td></tr>
              <tr><td>Web server software</td><td>{serverLine}</td></tr>
              <tr><td>Connection</td><td>{connectionLine}</td></tr>
              {#if report.infra.ips.length}
                <tr><td>IP addresses</td><td>
                  {#each ipGroups as g (g.label)}
                    <div>{g.ips.length} address{g.ips.length === 1 ? '' : 'es'} · {g.label}</div>
                    <div class="mono small muted">{dot(g.ips.find((i) => i.version === 4)?.ip, g.ips.find((i) => i.version === 6)?.ip, g.ips.length > 2 ? `+${g.ips.length - 2} more` : null)}</div>
                  {/each}
                </td></tr>
              {/if}
              <tr><td>DNS provider</td><td>{report.infra.dnsProvider?.name ?? '—'}</td></tr>
              <tr><td>Email provider</td><td>{report.infra.emailProvider?.name ?? 'No email set up'}</td></tr>
              {#if report.domain}<tr><td>Registered</td><td>{dot(fmtDate(report.domain.created), report.domain.registrar ? `with ${report.domain.registrar}` : null, report.external.wayback ? `online since at least ${fmtDate(report.external.wayback)}` : null)}</td></tr>{/if}
              {#if report.external.greenHosting}<tr><td>Green hosting</td><td>{report.external.greenHosting.green ? `Yes: ${report.external.greenHosting.hostedBy ?? 'listed by the Green Web Foundation'}` : 'Not listed by the Green Web Foundation'}</td></tr>{/if}
              {#if report.domain?.status.length}<tr><td>Domain status</td><td class="small">{report.domain.status.join(', ')}</td></tr>{/if}
            </tbody>
          </table>
        </div>
        {#if report.infra.ips.length > 2}
          <details class="show-all" open={printMode}>
            <summary>All {report.infra.ips.length} IP addresses</summary>
            <div class="table-wrap"><table class="table compact"><tbody>{#each report.infra.ips as ip (ip.ip)}<tr><td class="mono small wrap">{ipLine(ip)}</td></tr>{/each}</tbody></table></div>
          </details>
        {/if}
        {#if (report.http?.chain && report.http.chain.length > 1) || Object.keys(report.http?.cacheHeaders ?? {}).length}
          <details class="show-all" open={printMode}>
            <summary>Response details: redirects and caching</summary>
            <div class="table-wrap">
              <table class="table kv compact kv-stack">
                <tbody>
                  {#if report.http?.chain && report.http.chain.length > 1}<tr><td>Redirects</td><td>{#each report.http.chain as hop}<div class="mono small wrap">{hop.location ? `${hop.status} ${hop.url} → ${hop.location}` : `${hop.status} ${hop.url}`}</div>{/each}</td></tr>{/if}
                  {#if Object.keys(report.http?.cacheHeaders ?? {}).length}<tr><td>Caching</td><td>{#each Object.entries(report.http?.cacheHeaders ?? {}) as [k, v]}<div class="mono small wrap">{k}: {v}</div>{/each}</td></tr>{/if}
                </tbody>
              </table>
            </div>
          </details>
        {/if}
        {#if report.dns}
          {@const dnsCount = report.dns.A.length + report.dns.AAAA.length + report.dns.CNAME.length + report.dns.NS.length + report.dns.MX.length + report.dns.TXT.length + report.dns.CAA.length}
          <details class="show-all" open={printMode}>
            <summary>{dnsCount} DNS records</summary>
            <div class="table-wrap">
              <table class="table compact">
                <thead><tr><th style="width: 80px">Type</th><th>Value</th></tr></thead>
                <tbody>
                  {#each report.dns.A as v}<tr><td class="code-cell">A</td><td class="mono small wrap">{v}</td></tr>{/each}
                  {#each report.dns.AAAA as v}<tr><td class="code-cell">AAAA</td><td class="mono small wrap">{v}</td></tr>{/each}
                  {#each report.dns.CNAME as v}<tr><td class="code-cell">CNAME</td><td class="mono small wrap">{v}</td></tr>{/each}
                  {#each report.dns.NS as v}<tr><td class="code-cell">NS</td><td class="mono small wrap">{v}</td></tr>{/each}
                  {#each report.dns.MX as v}<tr><td class="code-cell">MX</td><td class="mono small wrap">{v.priority} {v.exchange}</td></tr>{/each}
                  {#each report.dns.CAA as v}<tr><td class="code-cell">CAA</td><td class="mono small wrap">{v}</td></tr>{/each}
                  {#each report.dns.TXT as v}<tr><td class="code-cell">TXT</td><td class="mono small wrap">{v}</td></tr>{/each}
                </tbody>
              </table>
            </div>
          </details>
        {/if}
      </Section>

      <!-- ===== Subdomains ===== -->
      {#if report.external.subdomains}
        {@const sd = report.external.subdomains}
        <Section id="c-subdomains" title="Subdomains" sub="Hostnames under {report.target.registrableDomain} that have had a TLS certificate issued, from public Certificate Transparency logs. Nothing was probed; some may no longer exist." open={false} status="{sd.total} found" allowBreak>
          {#if sd.names.length}
            <div class="chips-grid">
              {#each sd.names as n (n)}<span class="val">{n}</span>{/each}
            </div>
            {#if sd.names.length < sd.total}<p class="note">Showing the first {sd.names.length} of {sd.total}.</p>{/if}
          {:else}
            <p class="note">No other hostnames appear in Certificate Transparency logs for this domain.</p>
          {/if}
        </Section>
      {/if}

      <!-- ===== Privacy ===== -->
      <Section id="c-privacy" title="Privacy & third parties" sub="Trackers, ad pixels, consent and everything the page loads from other companies.{!running && sectionScore('privacy') === null && section('privacy')?.note ? ` ${section('privacy')!.note}` : ''}" open={stPrivacy.open} status={stPrivacy.status} tone={stPrivacy.tone} score={sectionScore('privacy')} allowBreak>
        {#if failed}<p class="note">No page was loaded, so trackers and third-party requests could not be assessed.</p>{:else if report.privacy.length}<FindingsList findings={report.privacy} open={printMode} />{/if}
        {#if report.thirdParties.length}
          <details class="show-all" open={printMode}>
            <summary>{report.thirdParties.length} third-party domain{report.thirdParties.length === 1 ? '' : 's'}</summary>
            <div class="table-wrap">
              <table class="table compact" style="min-width: 520px">
                <thead><tr><th>Service</th><th>Purpose</th><th>Domain</th><th class="num">Requests</th></tr></thead>
                <tbody>{#each report.thirdParties as t (t.domain)}<tr><td>{t.technology ?? `Unknown (${t.domain.split('.').slice(-2).join('.')})`}</td><td class="muted">{t.category ?? '—'}</td><td class="mono small wrap">{t.domain}</td><td class="num">{t.count}</td></tr>{/each}</tbody>
              </table>
            </div>
          </details>
        {/if}
      </Section>

      <!-- ===== Scan log receipt ===== -->
      {#if !running && !failed}
        <details class="receipt" open={printMode}>
          <summary>&gt; scan log{durationMs ? ` · ${fmtMs(durationMs)}` : ''} · {fmtDate(data.scan.createdAt, true)}</summary>
          <div class="rbody">
            <ScanLog host={data.scan.displayHost} {stages} {status} />
            <div class="rmeta">
              <span>id {data.scan.id}</span>
              {#if report.infra.ips[0]}<span>ip {report.infra.ips[0].ip}</span>{/if}
              <span>scanner {report.scan.scannerVersion}</span>
              {#if report.scan.fingerprintsVersion}<span>fingerprints {report.scan.fingerprintsVersion}</span>{/if}
              <span>report v{report.reportVersion}</span>
              <a class="no-print" href="/api/scans/{data.scan.id}" rel="nofollow">json</a>
            </div>
          </div>
        </details>
      {/if}
    </div>
  </div>
{/if}
