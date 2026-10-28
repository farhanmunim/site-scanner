<script lang="ts">
  import type { Report } from '@site-scanner/core/types';
  import Card from './Card.svelte';
  import Findings from './Findings.svelte';
  import { rollup } from './helpers';
  let { report, open = false, note = null }: { report: Report; open?: boolean; note?: string | null } = $props();
  const CODES: Record<string, string> = { title: 'title', description: 'meta description', canonical: 'canonical', sitemap: 'sitemap.xml', robots: 'robots.txt', 'structured-data': 'structured data', og: 'og:image', lang: 'lang', viewport: 'viewport', h1: 'h1', indexable: 'robots meta', 'img-alt': 'img alt' };
  let s = $derived(report.seo);
  let r = $derived(rollup(s?.findings, 'No page'));
  let values = $derived.by((): Record<string, string | null> => {
    if (!s) return {};
    return { title: s.title, description: s.metaDescription, canonical: s.canonical, sitemap: report.robots?.sitemaps[0] ?? null, robots: report.robots?.present ? `${report.robots.groups} group(s)${report.robots.disallowAll ? ' · blocks all' : ''}` : null, 'structured-data': s.structuredData.types.length ? s.structuredData.types.slice(0, 6).join(' · ') : null, og: s.openGraph['og:image'] ?? null, lang: s.lang, viewport: s.viewport, h1: s.h1[0] ?? null };
  });
</script>

<Card id="seo" title="SEO & meta tags" desc="Homepage metadata and crawl configuration.{note ? ` ${note} Not scored.` : ''}" chip={r.label} tone={r.tone}>
  {#if s}
    <Findings findings={s.findings} codes={CODES} {values} {open} />
    <details class="ss-fold" {open}>
      <summary>Page details</summary>
      <div class="in"><dl class="ss-kv">
        <dt>Headings</dt><dd>{Object.entries(s.headingCounts).filter(([, v]) => v).map(([k, v]) => `${k.toUpperCase()}: ${v}`).join(' · ') || '—'}</dd>
        <dt>Links</dt><dd>{s.links.internal} internal · {s.links.external} external</dd>
        <dt>Images without alt text</dt><dd>{s.images.missingAlt} of {s.images.total}</dd>
        {#if s.hreflang.length}<dt>Languages (hreflang)</dt><dd>{s.hreflang.slice(0, 10).join(', ')}</dd>{/if}
        <dt>Well-known files</dt><dd>{[report.wellKnown.securityTxt && 'security.txt', report.wellKnown.adsTxt && 'ads.txt', report.wellKnown.llmsTxt && 'llms.txt'].filter(Boolean).join(', ') || 'None found'}</dd>
      </dl></div>
    </details>
  {:else}<p class="ss-empty">No page to assess.</p>{/if}
</Card>
