<script lang="ts">
  import type { Finding, Report } from '@site-scanner/core/types';
  import { issues, platformLabel, TLS_IDS } from '$lib/ui/report/helpers';
  let { data } = $props();
  let report = $derived(data.scan.report as Report | null);
  let host = $derived(data.scan.displayHost);
  let scores = $derived(report?.scores);
  const word: Record<string, string> = { good: 'Pass', warn: 'Warn', bad: 'Fail', info: 'Info', unknown: '—', na: 'N/A' };
  const clip = (s: string | null | undefined, n = 220) => (s && s.length > n ? s.slice(0, n - 1) + '…' : (s ?? ''));
  const when = (d: Date | string) => new Date(d).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
  const rank: Record<string, number> = { bad: 0, warn: 1, good: 2, info: 3, unknown: 4, na: 5 };
  const sorted = (l: Finding[] | null | undefined) => [...(l ?? [])].filter((f) => f.relevance !== 'low').sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));

  let sections = $derived.by(() => {
    if (!report) return [] as { title: string; note?: string; rows: Finding[] }[];
    const r = report;
    const out: { title: string; note?: string; rows: Finding[] }[] = [];
    const add = (title: string, rows: Finding[] | null | undefined, note?: string) => {
      const list = sorted(rows);
      if (list.length || note) out.push({ title, rows: list, note });
    };
    if (r.social) add('Page and social previews', null, [r.social.title ? `Title: “${r.social.title}”.` : '', r.social.description ? `Description: “${r.social.description.slice(0, 200)}”.` : '', r.social.profiles.length ? `Profiles: ${r.social.profiles.map((p) => p.network).join(', ')}.` : '', ...r.social.notes].filter(Boolean).join(' ') || undefined);
    add('Domain registration', r.domainChecks);
    const spf = r.dns?.spf;
    add('Email security', r.email, spf ? `SPF follows ${spf.totalLookups} DNS lookup${spf.totalLookups === 1 ? '' : 's'} (limit 10).` : undefined);
    const bl = r.blocklists;
    add('Blocklists', null, bl ? (bl.listed.length ? `Listed on: ${bl.listed.map((h) => `${h.list} (${h.subject})`).join(', ')}.` : `Not listed on ${bl.lists.length} public blocklists (${bl.checked.length} addresses checked).`) : undefined);
    add('Reputation', r.reputation?.findings);
    add('Security headers', r.security.filter((f) => !TLS_IDS.has(f.id)));
    add('HTTPS and certificate', r.security.filter((f) => TLS_IDS.has(f.id)));
    add('SEO', r.seo?.findings);
    const p = r.performance;
    add('Performance', null, p ? `Lighthouse (${p.strategy}): performance ${p.scores.performance ?? '—'}, accessibility ${p.scores.accessibility ?? '—'}, best practices ${p.scores.bestPractices ?? '—'}, SEO ${p.scores.seo ?? '—'}. LCP ${p.lab.lcpMs != null ? (p.lab.lcpMs / 1000).toFixed(1) + ' s' : '—'}, CLS ${p.lab.cls ?? '—'}, TBT ${p.lab.tbtMs != null ? Math.round(p.lab.tbtMs) + ' ms' : '—'}.${r.fieldHistory?.periods.length ? ` Real users (Chrome UX Report, latest): LCP ${r.fieldHistory.periods.at(-1)?.lcpMs ?? '—'} ms, INP ${r.fieldHistory.periods.at(-1)?.inpMs ?? '—'} ms, CLS ${r.fieldHistory.periods.at(-1)?.cls ?? '—'}.` : ''}` : undefined);
    if (r.aiReadiness) add(`AI readiness (${r.aiReadiness.score}/100, grade ${r.aiReadiness.grade})`, r.aiReadiness.items.map((i) => ({ id: i.id, title: i.title, status: i.status, observed: i.observed, detail: i.detail }) as Finding));
    add('PHP', r.php?.findings);
    add('Support status', r.eol?.findings);
    if (r.exposure) add('Open ports and exposure', r.exposure.findings, [r.exposure.geo ? `Server in ${[r.exposure.geo.city, r.exposure.geo.country].filter(Boolean).join(', ')}.` : '', r.exposure.rank?.rank ? `Popularity rank #${r.exposure.rank.rank.toLocaleString('en-GB')} (Tranco).` : ''].filter(Boolean).join(' ') || undefined);
    add('Privacy', r.privacy);
    return out;
  });

  let fixes = $derived.by(() => {
    if (!report) return [] as { f: Finding; section: string }[];
    const r = report;
    const src: [string, Finding[] | null | undefined][] = [
      ['Security headers', r.security.filter((f) => !TLS_IDS.has(f.id))],
      ['HTTPS', r.security.filter((f) => TLS_IDS.has(f.id))],
      ['SEO', r.seo?.findings],
      ['Email', r.email],
      ['Domain', r.domainChecks],
      ['PHP', r.php?.findings],
      ['Reputation', r.reputation?.findings],
      ['Ports', r.exposure?.findings],
      ['Support', r.eol?.findings],
      ['Privacy', r.privacy],
      ['Platform', r.cms?.flags]
    ];
    return src.flatMap(([section, list]) => issues(list).map((f) => ({ f, section })));
  });

  let techs = $derived((report?.technologies ?? []).filter((t) => !t.implied && t.confidence !== 'low'));
  let techGroups = $derived.by(() => {
    const m = new Map<string, string[]>();
    for (const t of techs) {
      const c = t.categories[0]?.name ?? 'Other';
      m.set(c, [...(m.get(c) ?? []), t.version ? `${t.name} ${t.version}` : t.name]);
    }
    return [...m.entries()];
  });
  let prop = $derived(report?.propagation);
  let propSummary = $derived.by(() => {
    if (!prop) return '';
    const bad = prop.rows.filter((r) => !r.consistent && !r.note);
    const resolvers = Math.max(0, ...prop.rows.map((r) => r.answers.filter((a) => a.values !== null).length));
    return bad.length ? `Resolvers disagree on ${bad.map((r) => r.type).join(', ')} records.` : `${resolvers} public resolvers return identical answers for ${prop.rows.map((r) => r.type).join(', ')}.`;
  });
  let vulns = $derived(report?.cms?.vulnerabilities?.filter((v) => v.affectsInstalled === true) ?? []);
</script>

<svelte:head><title>{host} – site scan report</title></svelte:head>

<main class="doc">
  <header class="head">
    <div class="brand">Site scan report</div>
    <h1>{#if report?.social?.favicon.dataUrl}<img class="fav" src={report.social.favicon.dataUrl} alt="" />{/if}{host}</h1>
    <p class="meta">{data.scan.url} · scanned {when(data.scan.createdAt)}{data.scan.durationMs ? ` · ${(data.scan.durationMs / 1000).toFixed(0)} s` : ''}</p>
  </header>

  {#if !report}
    <p>This scan has no report ({data.scan.status}).{data.scan.error ? ` ${data.scan.error}` : ''}</p>
  {:else}
    {#if scores && scores.overall !== null}
      <section class="scorebox">
        <div class="big"><span class="num">{scores.overall}</span><span class="of">/ 100</span><span class="grade">Grade {scores.grade}</span></div>
        <p class="sum">{scores.summary}</p>
        <table class="scores"><tbody>
          <tr>{#each scores.sections.filter((s) => s.score !== null) as s}<td><div class="sl">{s.label}</div><div class="sv"><i class="dot {s.score! >= 85 ? 'good' : s.score! >= 60 ? 'warn' : 'bad'}"></i>{s.score}</div></td>{/each}</tr>
        </tbody></table>
      </section>
    {:else if report.scan.scope !== 'full'}
      <p class="sum">Focused check ({report.scan.scope}). Focused checks are not scored.</p>
    {/if}

    {#if report.platform || techGroups.length}
      <p class="built"><b>Built with:</b> {report.platform ? `${report.platform.name}${report.platform.version ? ' ' + report.platform.version : ''}` : 'no recognised CMS, shop or builder'}{report.infra.hosting ? ` · hosted on ${report.infra.hosting.name}` : ''}{report.infra.cdn ? ` · CDN ${report.infra.cdn.name}` : ''}</p>
    {/if}

    {#if fixes.length}
      <h2>What to fix first</h2>
      <table class="rows">
        <tbody>
          {#each fixes.slice(0, 14) as { f, section }}
            <tr><td class="st {f.status}"><i class="dot {f.status}"></i>{word[f.status]}</td><td class="nm">{f.title}<span class="sec">{section}</span></td><td class="ob">{clip(f.observed, 200)}</td></tr>
          {/each}
        </tbody>
      </table>
      {#if fixes.length > 14}<p class="more">…and {fixes.length - 14} more below.</p>{/if}
    {:else}
      <p class="sum">No failing or warning checks.</p>
    {/if}

    {#each sections as s}
      <h2>{s.title}</h2>
      {#if s.note}<p class="note">{s.note}</p>{/if}
      {#if s.rows.length}
        <table class="rows">
          <tbody>
            {#each s.rows as f (f.id)}
              <tr class:quiet={f.status === 'info' || f.status === 'unknown'}>
                <td class="st {f.status}"><i class="dot {f.status}"></i>{word[f.status] ?? f.status}</td>
                <td class="nm">{f.title}</td>
                <td class="ob">{clip(f.observed, f.status === 'bad' || f.status === 'warn' ? 260 : 140)}{#if f.detail && (f.status === 'bad' || f.status === 'warn')}<span class="det">{clip(f.detail, 280)}</span>{/if}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {/each}

    {#if techGroups.length}
      <h2>Technology</h2>
      <table class="rows plain"><tbody>{#each techGroups as [cat, names]}<tr><td class="nm">{cat}</td><td class="ob">{names.join(', ')}</td></tr>{/each}</tbody></table>
    {/if}

    {#if report.cms}
      <h2>{platformLabel(report) || 'Platform'}</h2>
      <p class="note">{report.cms.version ? `Version ${report.cms.version}` : 'Version hidden'}{report.cms.theme ? ` · theme ${report.cms.theme.name ?? report.cms.theme.slug}` : ''} · {report.cms.plugins.length} {report.cms.platform === 'wordpress' ? 'plugins' : 'apps'} visible{report.cms.vulnerabilities ? ` · ${vulns.length} known vulnerabilit${vulns.length === 1 ? 'y' : 'ies'} affect installed versions` : ''}.</p>
      {#if vulns.length}
        <table class="rows"><tbody>{#each vulns.slice(0, 12) as v}<tr><td class="st bad"><i class="dot bad"></i>Fail</td><td class="nm">{v.component}: {v.slug} {v.version ?? ''}</td><td class="ob">{clip(v.title, 160)}{v.fixedIn ? ` — fixed in ${v.fixedIn}` : ''}</td></tr>{/each}</tbody></table>
      {/if}
      {#if report.cms.flags.length}
        <table class="rows"><tbody>{#each sorted(report.cms.flags) as f (f.id)}<tr class:quiet={f.status === 'info'}><td class="st {f.status}"><i class="dot {f.status}"></i>{word[f.status] ?? f.status}</td><td class="nm">{f.title}</td><td class="ob">{clip(f.observed, 160)}</td></tr>{/each}</tbody></table>
      {/if}
    {/if}

    {#if report.vulnerableLibraries?.length || report.exposedSecrets?.length}
      <h2>Scripts and secrets</h2>
      <table class="rows"><tbody>
        {#each report.vulnerableLibraries ?? [] as l}<tr><td class="st bad"><i class="dot bad"></i>Fail</td><td class="nm">{l.name} {l.version}</td><td class="ob">{l.vulns.length} known vulnerabilit{l.vulns.length === 1 ? 'y' : 'ies'}</td></tr>{/each}
        {#each report.exposedSecrets ?? [] as s}<tr><td class="st bad"><i class="dot bad"></i>Fail</td><td class="nm">{s.kind}</td><td class="ob">{s.preview} in {clip(s.source, 80)}</td></tr>{/each}
      </tbody></table>
    {/if}

    {#if report.dns}
      <h2>DNS</h2>
      <table class="rows plain"><tbody>
        {#if report.dns.A.length}<tr><td class="nm">A</td><td class="ob mono">{report.dns.A.join(', ')}</td></tr>{/if}
        {#if report.dns.AAAA.length}<tr><td class="nm">AAAA</td><td class="ob mono">{report.dns.AAAA.join(', ')}</td></tr>{/if}
        {#if report.dns.NS.length}<tr><td class="nm">NS</td><td class="ob mono">{report.dns.NS.join(', ')}</td></tr>{/if}
        {#if report.dns.MX.length}<tr><td class="nm">MX</td><td class="ob mono">{report.dns.MX.map((m) => `${m.priority} ${m.exchange}`).join(', ')}</td></tr>{/if}
        {#if report.dns.CAA.length}<tr><td class="nm">CAA</td><td class="ob mono">{report.dns.CAA.join('; ')}</td></tr>{/if}
        {#if propSummary}<tr><td class="nm">Propagation</td><td class="ob">{propSummary}</td></tr>{/if}
      </tbody></table>
    {/if}

    {#if report.external.subdomains?.names.length}
      <h2>Subdomains</h2>
      <p class="note">{report.external.subdomains.total} found in public certificate logs{report.external.subdomains.names.length < report.external.subdomains.total ? ` (first ${report.external.subdomains.names.length} listed)` : ''}.</p>
      <p class="mono small">{report.external.subdomains.names.slice(0, 40).join(', ')}{report.external.subdomains.names.length > 40 ? ', …' : ''}</p>
    {/if}
  {/if}

  <footer class="foot">Passive scan: only public pages and DNS were read. Generated by Site Scan · results can be wrong or incomplete; verify before acting.</footer>
</main>

<style>
  :global(html), :global(body) { background: #fff !important; color: #111; }
  :global(body) { margin: 0; font: 10.5px/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  .doc { max-width: 190mm; margin: 0 auto; padding: 8mm 0; color: #111; }
  .head { border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 10px; }
  .brand { text-transform: uppercase; letter-spacing: 0.12em; font-size: 9px; color: #555; }
  h1 { font-size: 24px; margin: 2px 0; font-weight: 700; word-break: break-all; }
  .fav { width: 22px; height: 22px; object-fit: contain; vertical-align: -3px; margin-right: 8px; }
  .meta { margin: 0; color: #555; font-size: 9.5px; word-break: break-all; }
  h2 { font-size: 12.5px; margin: 14px 0 4px; padding-bottom: 2px; border-bottom: 1px solid #bbb; break-after: avoid; }
  .scorebox { border: 1px solid #111; padding: 8px 10px; margin: 8px 0; break-inside: avoid; }
  .big { display: flex; align-items: baseline; gap: 6px; }
  .num { font-size: 34px; font-weight: 700; line-height: 1; }
  .of { color: #555; }
  .grade { margin-left: auto; font-weight: 700; font-size: 14px; }
  .sum { margin: 4px 0; }
  .built { margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  table.scores td { width: 1%; padding: 4px 8px 0 0; vertical-align: top; }
  .sl { color: #555; font-size: 9px; }
  .sv { font-weight: 700; font-size: 13px; }
  .rows td { padding: 3px 6px 3px 0; border-bottom: 1px solid #e3e3e3; vertical-align: top; }
  .rows tr { break-inside: avoid; }
  .rows .st { width: 46px; font-weight: 700; white-space: nowrap; }
  .rows .nm { width: 26%; font-weight: 600; }
  .rows.plain .nm { width: 18%; }
  .sec { display: block; font-weight: 400; color: #666; font-size: 9px; }
  .ob { color: #222; word-break: break-word; }
  .det { display: block; color: #555; margin-top: 1px; }
  .quiet .nm, .quiet .ob { color: #555; font-weight: 400; }
  .note, .more { margin: 2px 0 4px; color: #333; }
  .mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
  .small { font-size: 9px; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; background: #999; vertical-align: -0.5px; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .dot.good { background: #1a8a3c; }
  .dot.warn { background: #d98a00; }
  .dot.bad { background: #c9302c; }
  .dot.info, .dot.unknown, .dot.na { background: #aaa; }
  .foot { margin-top: 16px; padding-top: 6px; border-top: 1px solid #bbb; color: #666; font-size: 8.5px; }
</style>
