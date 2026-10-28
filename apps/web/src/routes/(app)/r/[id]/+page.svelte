<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import type { Report, StageMeta, StageName } from '@site-scanner/core/types';
  import { planFor } from '@site-scanner/core/scope';
  import { scoreTone } from '@site-scanner/core/analyze/score';
  import { PROFILE_LABELS } from '@site-scanner/core/analyze/profile';
  import { explainFailure } from '@site-scanner/core/analyze/reasons';
  import { subscribeScan, TERMINAL } from '$lib/scan-events';
  import { fmtDate, fmtMs } from '$lib/format';
  import Icon from '$lib/ui/Icon.svelte';
  import { SECTION_LABEL, toolBySlug, TOOLS, type SectionId } from '$lib/ui/tools';
  import Ring from '$lib/ui/report/Ring.svelte';
  import Modules from '$lib/ui/report/Modules.svelte';
  import FixesCard from '$lib/ui/report/FixesCard.svelte';
  import DomainCard from '$lib/ui/report/DomainCard.svelte';
  import DnsCard from '$lib/ui/report/DnsCard.svelte';
  import EmailCard from '$lib/ui/report/EmailCard.svelte';
  import SpfCard from '$lib/ui/report/SpfCard.svelte';
  import BlocklistCard from '$lib/ui/report/BlocklistCard.svelte';
  import TlsCard from '$lib/ui/report/TlsCard.svelte';
  import HeadersCard from '$lib/ui/report/HeadersCard.svelte';
  import SeoCard from '$lib/ui/report/SeoCard.svelte';
  import PerformanceCard from '$lib/ui/report/PerformanceCard.svelte';
  import AiCard from '$lib/ui/report/AiCard.svelte';
  import StackCard from '$lib/ui/report/StackCard.svelte';
  import PhpCard from '$lib/ui/report/PhpCard.svelte';
  import WordPressCard from '$lib/ui/report/WordPressCard.svelte';
  import LibrariesCard from '$lib/ui/report/LibrariesCard.svelte';
  import SubdomainsCard from '$lib/ui/report/SubdomainsCard.svelte';
  import PrivacyCard from '$lib/ui/report/PrivacyCard.svelte';
  import { dot, rollup, toneFromScore, TLS_IDS, type Tone } from '$lib/ui/report/helpers';

  let { data } = $props();
  let printMode = $derived(page.url.searchParams.get('print') === '1');
  let status = $state<string>(data.scan.status);
  let stages = $state<Partial<Record<StageName, StageMeta>>>(data.scan.stages ?? {});
  let report = $state<Report | null>(data.scan.report ?? null);
  let scanError = $state<string | null>(data.scan.error ?? null);
  let durationMs = $state<number | null>(data.scan.durationMs ?? null);
  let running = $derived(!TERMINAL.has(status));

  /**
   * A focused scan only ran one tool's checks, so that is all it can show. A full scan can be viewed through any
   * tool with `?tool=email`; the full report is one click away.
   */
  let scopeTool = $derived(data.scan.scope && data.scan.scope !== 'full' ? toolBySlug(data.scan.scope) : null);
  let tool = $derived(scopeTool ?? (printMode ? null : toolBySlug(page.url.searchParams.get('tool'))));
  let stageOrder = $derived(planFor(data.scan.scope).stages);
  const FULL: SectionId[] = ['fixes', 'domain', 'email', 'spf', 'blocklist', 'headers', 'tls', 'seo', 'performance', 'ai', 'stack', 'php', 'wordpress', 'libraries', 'dns', 'subdomains', 'privacy'];
  let shown = $derived<SectionId[]>(tool ? tool.sections : FULL);
  let has = $derived((id: SectionId) => shown.includes(id));

  let active = $state<string>('');
  onMount(() => {
    if (printMode) {
      document.documentElement.setAttribute('data-theme', 'light');
      for (const d of document.querySelectorAll('details')) d.open = true;
    }
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
    const spy = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) active = e.target.id.replace(/^s-/, '');
    }, { rootMargin: '-80px 0px -65% 0px' });
    for (const el of document.querySelectorAll('.ss-card[id^="s-"]')) spy.observe(el);
    const cleanup = () => {
      window.removeEventListener('hashchange', reveal);
      spy.disconnect();
    };
    if (!running) return cleanup;
    const unsub = subscribeScan(data.scan.id, (u) => {
      status = u.status;
      if (u.stages) stages = u.stages;
      if (u.report) report = u.report;
      scanError = u.error ?? null;
      if (TERMINAL.has(u.status)) void fetch(`/api/scans/${data.scan.id}`).then((r) => r.json()).then((j: { durationMs?: number | null; report?: Report | null }) => { durationMs = j.durationMs ?? null; if (j.report) report = j.report; }).catch(() => {});
    });
    return () => {
      cleanup();
      unsub();
    };
  });

  const statusText: Record<string, string> = { complete: 'Complete', partial: 'Partly complete', restricted: 'Limited: site blocks bots', failed: 'Failed', queued: 'Queued', running: 'Scanning' };
  let scores = $derived(report?.scores ?? null);
  let failed = $derived(!running && report?.scan.quality === 'failed');
  let failureReason = $derived(failed ? explainFailure(report?.stages?.http?.note ?? scanError) : null);
  let overall = $derived(!running && scores?.overall != null ? scores.overall : null);
  let tone = $derived<Tone>(({ green: 'good', amber: 'warn', red: 'bad', grey: '' } as const)[scoreTone(overall)]);
  const note = (id: string) => (!running && scores?.sections.find((s) => s.id === id)?.score === null ? (scores?.sections.find((s) => s.id === id)?.note ?? null) : null);
  let httpChip = $derived.by(() => {
    const st = report?.http?.status ?? null;
    if (st === null) return { c: '', t: 'No response' } as const;
    return { c: st < 400 ? 'good' : 'bad', t: `HTTP ${st}` } as const;
  });

  // Sidebar: every shown section, with a score or status where we have one.
  let side = $derived.by(() => {
    if (!report) return [] as { id: SectionId; label: string; sc: string; tone: Tone }[];
    const sec = (id: string) => scores?.sections.find((s) => s.id === id)?.score ?? null;
    const val = (id: SectionId): { sc: string; tone: Tone } => {
      const num = (n: number | null) => (n === null || running ? { sc: '', tone: '' as Tone } : { sc: String(n), tone: toneFromScore(n) });
      switch (id) {
        case 'headers': return num(sec('headers'));
        case 'tls': return num(sec('tls'));
        case 'seo': return num(sec('seo'));
        case 'email': return num(sec('email'));
        case 'performance': return num(sec('performance'));
        case 'privacy': return num(sec('privacy'));
        case 'ai': return num(report!.aiReadiness?.score ?? null);
        case 'domain': { const r = rollup(report!.domainChecks); return { sc: r.tone === 'good' ? '✓' : r.bad + r.warn ? String(r.bad + r.warn) : '', tone: r.tone }; }
        case 'blocklist': { const b = report!.blocklists; return b ? { sc: b.listed.length ? String(b.listed.length) : '✓', tone: b.listed.length ? 'bad' : 'good' } : { sc: '', tone: '' }; }
        case 'spf': { const s = report!.dns?.spf; return s ? { sc: `${s.totalLookups}/10`, tone: s.totalLookups > 10 ? 'bad' : s.totalLookups >= 9 ? 'warn' : 'good' } : { sc: '', tone: '' }; }
        case 'libraries': { const n = (report!.vulnerableLibraries?.length ?? 0) + (report!.exposedSecrets?.length ?? 0); return report!.vulnerableLibraries == null ? { sc: '', tone: '' } : { sc: n ? String(n) : '✓', tone: n ? 'bad' : 'good' }; }
        case 'php': { const p = report!.php; return p?.detected ? { sc: p.version ?? '?', tone: p.supported === false ? 'bad' : p.supported ? 'good' : '' } : { sc: '', tone: '' }; }
        case 'wordpress': { const r = rollup(report!.cms?.flags); return report!.cms ? { sc: r.bad + r.warn ? String(r.bad + r.warn) : '✓', tone: r.tone } : { sc: '', tone: '' }; }
        default: return { sc: '', tone: '' };
      }
    };
    return shown.map((id) => ({ id, label: SECTION_LABEL[id], ...val(id) }));
  });

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

  const stageLabel: Record<StageName, string> = { dns: 'Resolving DNS and email records', http: 'Fetching the page', files: 'Reading robots, sitemap and scripts', rdap: 'Looking up domain registration', cert: 'Inspecting the TLS certificate', browser: 'Rendering in a browser', external: 'Performance, blocklists, vulnerabilities, subdomains' };
  const stageRow = (s: StageName) => {
    const st = stages[s]?.status ?? 'pending';
    const terminal = TERMINAL.has(status);
    if (st === 'pending') return { cls: terminal ? '' : 'cur', dt: '', r: terminal ? 'skipped' : '' };
    if (st === 'complete') return { cls: 'done', dt: 'g', r: 'ok' };
    if (st === 'restricted') return { cls: 'warn', dt: 'o', r: 'blocked' };
    if (st === 'failed') return { cls: 'fail', dt: 'r', r: 'failed' };
    return { cls: '', dt: '', r: 'skipped' };
  };
  let toolLabel = $derived(tool?.title ?? null);
  let siblings = $derived(TOOLS.filter((t) => t.slug !== tool?.slug).slice(0, 4));
</script>

<svelte:head>
  <title>{toolLabel ? `${toolLabel}: ` : ''}{data.scan.displayHost} — website report</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="ss-wrap">
  <div class="ss-rhead">
    <div style="min-width: 0">
      <span class="eui-eyebrow">{toolLabel ?? 'Website report'} · {fmtDate(data.scan.createdAt, true)}{durationMs ? ` · ${fmtMs(durationMs)} scan` : running ? ' · in progress' : ''}</span>
      <h1><a href={report?.http?.finalUrl ?? data.scan.url} rel="noopener nofollow" target="_blank">{data.scan.displayHost}</a></h1>
      <div class="ss-rmeta">
        {#if report?.http}<span class="ss-chip {httpChip.c}">{httpChip.t}</span>{/if}
        {#if status !== 'complete'}<span class="ss-chip {status === 'failed' ? 'bad' : running ? 'info' : 'warn'}">{statusText[status] ?? status}</span>{/if}
        {#if report?.profile}<span class="ss-chip" title={report.profile.signals.join(' · ')}>{PROFILE_LABELS[report.profile.kind]}</span>{/if}
        {#if report?.infra.ips[0]}<span class="ss-chip">{report.infra.ips[0].ip}</span>{/if}
        {#if tool && !scopeTool}<a class="ss-chip" href="/r/{data.scan.id}" style="text-decoration: none">Show full report →</a>{/if}
      </div>
    </div>
    <div class="ss-acts no-print">
      <button class="eui-btn outline sm" type="button" onclick={share}><Icon name="copy" size={14} />{shareLabel}</button>
      <a class="eui-btn outline sm" href="/?url={encodeURIComponent(data.scan.url)}{scopeTool ? `&tool=${scopeTool.slug}` : ''}" title="Runs a fresh scan if the cached result is older than 15 minutes"><Icon name="refresh" size={14} />Scan again</a>
      {#if !running}<button class="eui-btn outline sm" type="button" onclick={downloadPdf} disabled={pdfState === 'preparing'} aria-live="polite"><Icon name="download" size={14} />{pdfState === 'preparing' ? 'Preparing PDF…' : pdfState === 'error' ? 'PDF failed, retry' : 'PDF'}</button>{/if}
      <a class="eui-btn ghost sm" href="/api/scans/{data.scan.id}" rel="nofollow">JSON</a>
    </div>
  </div>

  {#if scopeTool && !running}<div class="ss-alert info" role="status"><Icon name="info" /><div>This was a focused <b>{scopeTool.title}</b> scan, so only its checks ran. <a href="/?url={encodeURIComponent(data.scan.url)}&go=1" style="text-decoration: underline">Run the full scan</a> for scores and every section.</div></div>{/if}
  {#if data.notice}<div class="ss-alert info" role="status"><Icon name="info" /><div>{data.notice}</div></div>{/if}
  {#if report?.safeBrowsing?.threats.length}<div class="ss-alert err" role="alert"><Icon name="alert" /><div><b>Google Safe Browsing flags this site</b> ({report.safeBrowsing.threats.join(', ').toLowerCase()}). Visit with care.</div></div>{/if}
  {#if failed}<div class="ss-alert err" role="alert"><Icon name="alert" /><div><b>We couldn't load this page:</b> {failureReason}. DNS, registration, certificate and email checks still ran; nothing that needs the page could be assessed, so the site is not scored.</div></div>{/if}
  {#if report && (report.http?.challenge || report.scan.quality === 'restricted')}<div class="ss-alert warn"><Icon name="alert" /><div>This website blocks automated visitors{report.http?.challenge ? ` (${report.http.challenge.vendor})` : ''}, so page-based checks are limited. Domain, DNS and certificate information was still collected.</div></div>{/if}

  {#if running || !report || failed}
    <section class="ss-card" style="margin-top: var(--space-4)">
      <header><div><h2>{running ? 'Scanning…' : failed ? 'Scan log' : 'No data'}</h2><p>{running ? 'Usually 10–40 seconds. Results fill in below as each step finishes.' : failed ? 'Which steps ran and where the page fetch stopped.' : (scanError ?? 'The scan produced no data.')}</p></div></header>
      <div class="body">
        <div class="ss-steps-list" aria-live="polite">
          {#each stageOrder as s (s)}
            {@const r = stageRow(s)}
            <div class="s {r.cls}" title={stages[s]?.note ?? undefined}>
              {#if r.cls === 'cur'}<span class="ss-spin" aria-hidden="true"></span>{:else}<span class="dt {r.dt}" aria-hidden="true"></span>{/if}
              <span>{stageLabel[s]}</span>
              {#if r.r}<span class="r">{r.r}</span>{/if}
            </div>
          {/each}
        </div>
      </div>
    </section>
  {/if}

  {#if report}
    {#if !tool}
      <section class="ss-verdict" class:has-shot={!!report.screenshot} style="margin-top: var(--space-4)">
        <Ring value={overall} {tone} grade={overall !== null ? (scores?.grade ?? null) : null} />
        <div>
          <p class="sum">{#if overall !== null && scores}{scores.summary}{:else if running}The health index is calculated once every step has finished.{:else}{scores?.summary ?? 'Not enough data was collected to score this site.'}{/if}</p>
          {#if report.profile}<p class="ss-note" style="margin-top: 12px">{dot(...report.profile.signals)}{#if !report.profile.interactive} · login and session checks shown for information only{/if}</p>{/if}
        </div>
        {#if report.screenshot}
          <div class="no-print">
            {#if 'url' in report.screenshot}<a class="ss-shot" href={report.screenshot.url} target="_blank" rel="noopener" title="Open full screenshot"><img src={report.screenshot.url} alt="Screenshot of {data.scan.displayHost}" width={report.screenshot.width} height={report.screenshot.height} /></a>{:else}<div class="ss-shot"><img src={report.screenshot.dataUrl} alt="Screenshot of {data.scan.displayHost}" /></div>{/if}
          </div>
        {/if}
      </section>
      <Modules {report} {running} />
    {/if}

    <div class="ss-layout" class:solo={printMode}>
      {#if !printMode}
        <nav class="ss-side no-print" aria-label="Report sections">
          {#each side as s (s.id)}
            <a href="#s-{s.id}" class:on={active === s.id}><span>{s.label}</span>{#if s.sc}<span class="sc {s.tone}">{s.sc}</span>{/if}</a>
          {/each}
          {#if tool}<hr /><a href={scopeTool ? `/?url=${encodeURIComponent(data.scan.url)}&go=1` : `/r/${data.scan.id}`}><span>{scopeTool ? 'Run full scan' : 'Full report'}</span><Icon name="arrow" size={12} /></a>{/if}
        </nav>
      {/if}
      <div class="ss-stack">
        {#if has('fixes') && !running && !failed}<FixesCard {report} />{/if}
        {#if has('domain')}<DomainCard {report} open={printMode} />{/if}
        {#if has('email')}<EmailCard {report} open={printMode} note={note('email')} />{/if}
        {#if has('spf')}<SpfCard {report} />{/if}
        {#if has('blocklist')}<BlocklistCard {report} {running} />{/if}
        {#if has('headers')}<HeadersCard {report} open={printMode} />{/if}
        {#if has('tls')}<TlsCard {report} open={printMode} />{/if}
        {#if has('seo')}<SeoCard {report} open={printMode} note={note('seo')} />{/if}
        {#if has('performance')}<PerformanceCard {report} open={printMode} {running} />{/if}
        {#if has('ai')}<AiCard {report} />{/if}
        {#if has('stack')}<StackCard {report} open={printMode} {failed} />{/if}
        {#if has('php')}<PhpCard {report} open={printMode} />{/if}
        {#if has('wordpress')}<WordPressCard {report} open={printMode} />{/if}
        {#if has('libraries')}<LibrariesCard {report} />{/if}
        {#if has('dns')}<DnsCard {report} open={printMode} {running} />{/if}
        {#if has('subdomains')}<SubdomainsCard {report} {running} open={printMode} />{/if}
        {#if has('privacy')}<PrivacyCard {report} open={printMode} {failed} note={note('privacy')} />{/if}

        {#if tool}
          <section class="ss-card no-print">
            <header>
              <div><h2>Try another tool on {data.scan.displayHost}</h2><p>{scopeTool ? 'Each tool runs only the checks it needs, so it is quick.' : 'This is a full scan, so any tool can show its view instantly.'}</p></div>
              <a class="eui-btn outline sm" href={scopeTool ? `/?url=${encodeURIComponent(data.scan.url)}&go=1` : `/r/${data.scan.id}`}>{scopeTool ? 'Run the full scan' : 'Full report'}</a>
            </header>
            <div class="body"><div class="ss-grid">{#each siblings as o (o.slug)}<a class="ss-tool" href={scopeTool ? `/?url=${encodeURIComponent(data.scan.url)}&go=1&tool=${o.slug}` : `/r/${data.scan.id}?tool=${o.slug}`}><span class="ico"><Icon name={o.icon} size={18} /></span><h3>{o.title}</h3><p>{o.short}</p></a>{/each}</div></div>
          </section>
        {/if}
        <p class="ss-note">{dot(`Scanner ${report.scan.scannerVersion}`, report.scan.fingerprintsVersion ? `fingerprints ${report.scan.fingerprintsVersion}` : null, `report v${report.reportVersion}`)}</p>
      </div>
    </div>
  {/if}
</div>
