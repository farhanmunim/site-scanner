<script lang="ts">
  import type { Finding, Report } from '@site-scanner/core/types';
  import { vitals } from '@site-scanner/core/analyze/score';
  import { daysUntil } from '$lib/format';
  import { issues, platformLabel, rollup, toneFromScore, TLS_IDS, type Tone } from './helpers';
  import Icon from '../Icon.svelte';
  let { report, running = false }: { report: Report; running?: boolean } = $props();

  interface Mod { id: string; icon: string; title: string; sub: string; big: string | null; small?: string; tone: Tone; chip: string; bullets: { t: string; tone: string }[] }
  const top = (list: Finding[] | undefined, n = 3) => issues(list).slice(0, n).map((f) => ({ t: f.title + (f.observed && f.observed.length < 70 ? `: ${f.observed}` : ''), tone: f.status }));

  let mods = $derived.by((): Mod[] => {
    const out: Mod[] = [];
    // Domain
    const exp = daysUntil(report.domain?.expires);
    const dRoll = rollup(report.domainChecks, report.domain ? 'Registered' : 'No data');
    out.push({ id: 'domain', icon: 'globe', title: 'Domain', sub: 'Registration · DNSSEC', big: exp === null ? null : String(exp), small: exp === null ? undefined : 'days to expiry', tone: dRoll.tone, chip: dRoll.label, bullets: [...top(report.domainChecks), ...(report.domain?.registrar ? [{ t: `Registrar: ${report.domain.registrar}`, tone: '' }] : []), { t: report.dns?.dnssec ? 'DNSSEC validated' : 'DNSSEC not enabled', tone: report.dns?.dnssec ? 'good' : '' }].slice(0, 3) });
    // Email
    const eRoll = rollup(report.email, 'No DNS data');
    const spf = report.dns?.spf;
    out.push({ id: 'email', icon: 'mail', title: 'Email', sub: 'SPF · DKIM · DMARC · blocklists', big: spf ? String(spf.totalLookups) : null, small: spf ? '/ 10 SPF lookups' : undefined, tone: eRoll.tone, chip: eRoll.label, bullets: top(report.email).length ? top(report.email) : [{ t: 'Authentication records look healthy', tone: 'good' }] });
    // Website health
    const sec = report.security.filter((f) => !TLS_IDS.has(f.id));
    const all = [...report.security, ...(report.seo?.findings ?? [])];
    const wRoll = rollup(all, 'No page');
    const overall = report.scores?.overall ?? null;
    out.push({ id: 'headers', icon: 'shield', title: 'Website health', sub: 'Security · HTTPS · SEO', big: !running && overall !== null ? String(overall) : null, small: overall !== null ? '/ 100' : undefined, tone: running ? '' : toneFromScore(overall) || wRoll.tone, chip: report.scores?.grade ? `Grade ${report.scores.grade}` : wRoll.label, bullets: top(all).length ? top(all) : [{ t: sec.length ? 'No warnings in the scored sections' : 'No page response', tone: sec.length ? 'good' : '' }] });
    // Performance
    const p = report.performance;
    const vs = p ? vitals(p).filter((v) => v.verdict !== 'good') : [];
    out.push({ id: 'performance', icon: 'bolt', title: 'Performance', sub: 'Core Web Vitals · Lighthouse', big: p?.scores.performance != null ? String(p.scores.performance) : null, small: p?.scores.performance != null ? '/ 100 mobile' : undefined, tone: p ? toneFromScore(p.scores.performance) : '', chip: p ? (vs.length ? `${vs.length} need work` : 'All good') : running ? 'Measuring…' : 'Not measured', bullets: p ? (vs.length ? vs.slice(0, 3).map((v) => ({ t: `${v.metric.replace('Ms', '').toUpperCase()} ${v.verdict === 'poor' ? 'is poor' : 'needs work'}`, tone: v.verdict === 'poor' ? 'bad' : 'warn' })) : [{ t: 'All Core Web Vitals pass', tone: 'good' }]) : [{ t: 'Needs a Google API key and a loaded page', tone: '' }] });
    // AI
    const ai = report.aiReadiness;
    out.push({ id: 'ai', icon: 'sparkle', title: 'AI readiness', sub: 'Crawlers · llms.txt · structure', big: ai ? String(ai.score) : null, small: ai ? '/ 100' : undefined, tone: toneFromScore(ai?.score), chip: ai ? `Grade ${ai.grade}` : 'Not assessed', bullets: ai ? ai.items.filter((i) => i.status !== 'good').slice(0, 3).map((i) => ({ t: `${i.title}: ${i.observed}`, tone: i.status })) : [] });
    // Platform
    if (report.cms) {
      const cRoll = rollup(report.cms.flags, platformLabel(report));
      out.push({ id: 'wordpress', icon: 'wp', title: platformLabel(report), sub: report.cms.version ? `Version ${report.cms.version}` : 'Version hidden', big: String(report.cms.plugins.length), small: report.cms.platform === 'wordpress' ? 'plugins' : 'apps', tone: cRoll.tone, chip: cRoll.label, bullets: top(report.cms.flags).length ? top(report.cms.flags) : [{ t: 'No warnings', tone: 'good' }] });
    } else {
      out.push({ id: 'wordpress', icon: 'wp', title: 'WordPress', sub: 'Core · theme · plugins', big: null, tone: '', chip: 'Not WordPress', bullets: [{ t: 'No WordPress or Shopify installation detected', tone: '' }] });
    }
    return out;
  });
</script>

<div class="ss-modules">
  {#each mods as m (m.id)}
    <a class="ss-mod" href="#s-{m.id}">
      <header>
        <div style="display: flex; gap: var(--space-2-5); align-items: flex-start"><span class="ss-tool-ico" style="color: var(--text-secondary); margin-top: 2px"><Icon name={m.icon} size={16} /></span><div><h3>{m.title}</h3><div class="sub">{m.sub}</div></div></div>
        <span class="ss-chip {m.tone}">{m.chip}</span>
      </header>
      {#if m.big !== null}<div class="big">{m.big}{#if m.small}<small>{m.small}</small>{/if}</div>{/if}
      <ul>{#each m.bullets as b}<li><i class={b.tone}></i><span>{b.t}</span></li>{/each}</ul>
      <span class="more">View details →</span>
    </a>
  {/each}
</div>
