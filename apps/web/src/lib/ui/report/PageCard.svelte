<script lang="ts">
  import type { Report } from '@site-scanner/core/types';
  import { fmtBytes } from '$lib/format';
  import Card from './Card.svelte';
  import { safeHref } from './helpers';
  let { report, running = false }: { report: Report; running?: boolean } = $props();
  let s = $derived(report.social);
  let h = $derived(report.http);
  let host = $derived(new URL(report.target.url).hostname.replace(/^www\./, ''));
  const clip = (v: string | null | undefined, n: number) => (v && v.length > n ? v.slice(0, n - 1).trimEnd() + '…' : (v ?? ''));
  let title = $derived(s?.title ?? report.seo?.title ?? host);
  let desc = $derived(s?.description ?? '');
  let ogTitle = $derived(s?.og.title ?? title);
  let ogDesc = $derived(s?.og.description ?? desc);
  let large = $derived(s?.twitter.card === 'summary_large_image');
  let crumbs = $derived(report.http?.finalUrl ? new URL(report.http.finalUrl).pathname.split('/').filter(Boolean) : []);
  let hops = $derived(h?.chain ?? []);
  let words = $derived(report.aiReadiness?.wordCount ?? null);
  const protocol = (p: string | null | undefined) => (p === 'h2' ? 'HTTP/2' : p === 'h3' ? 'HTTP/3' : p === 'http/1.1' ? 'HTTP/1.1' : (p ?? '—'));
</script>

<Card id="page" title="Page overview" desc="How the page looks in a browser tab, a search result and a shared link, and the basics of what was served." chip={s ? (s.notes.length ? `${s.notes.length} to improve` : 'Looks good') : running ? 'Reading…' : 'No page'} tone={s ? (s.notes.length > 2 ? 'warn' : s.notes.length ? '' : 'good') : ''}>
  {#if s}
    <div class="ss-prev-grid">
      <figure class="ss-prev">
        <figcaption>Browser tab</figcaption>
        <div class="tab"><span class="fav">{#if s.favicon.dataUrl}<img src={s.favicon.dataUrl} alt="" width="16" height="16" />{:else}<i></i>{/if}</span><span class="t">{clip(title, 34)}</span></div>
        <div class="bar">{host}</div>
      </figure>
      <figure class="ss-prev">
        <figcaption>Google result</figcaption>
        <div class="serp">
          <div class="site"><span class="fav">{#if s.favicon.dataUrl}<img src={s.favicon.dataUrl} alt="" width="16" height="16" />{:else}<i></i>{/if}</span><div><b>{s.og.siteName ?? host}</b><small>{host}{#each crumbs.slice(0, 2) as c} › {c}{/each}</small></div></div>
          <div class="ttl">{clip(title, 60)}</div>
          <div class="dsc">{desc ? clip(desc, 160) : 'No meta description: Google picks a snippet from the page.'}</div>
        </div>
      </figure>
      <figure class="ss-prev">
        <figcaption>Facebook, LinkedIn, Slack</figcaption>
        <div class="card">
          {#if s.og.imageUrl}<img class="im" src={s.og.imageUrl} alt={s.og.imageAlt ?? `Share image for ${host}`} loading="lazy" />{:else}<div class="im none">No share image</div>{/if}
          <div class="tx"><small>{host.toUpperCase()}</small><b>{clip(ogTitle, 70)}</b><span>{clip(ogDesc, 110)}</span></div>
        </div>
      </figure>
      <figure class="ss-prev">
        <figcaption>X (Twitter){#if !s.twitter.card} <em>· small card</em>{/if}</figcaption>
        <div class="card x" class:small={!large}>
          {#if s.twitter.imageUrl}<img class="im" src={s.twitter.imageUrl} alt="" loading="lazy" />{:else}<div class="im none">No image</div>{/if}
          <div class="tx"><b>{clip(s.twitter.title ?? ogTitle, 70)}</b><span>{clip(s.twitter.description ?? ogDesc, large ? 90 : 70)}</span><small>{host}</small></div>
        </div>
      </figure>
    </div>

    {#if s.notes.length}
      <ul class="ss-prev-notes">{#each s.notes as n}<li>{n}</li>{/each}</ul>
    {/if}
  {:else if !running}
    <p class="ss-empty">The page could not be read, so there is nothing to preview.</p>
  {/if}

  {#if h}
    <div class="ss-tiles" style="margin-top: var(--space-4)">
      <div class="ss-tile"><div class="k">Response</div><div class="v">{h.status ?? '—'}</div><div class="t">{h.timingMs ? `${Math.round(h.timingMs)} ms to first response` : ''}</div></div>
      <div class="ss-tile"><div class="k">HTML size</div><div class="v">{h.htmlBytes ? `${fmtBytes(h.htmlBytes)}${h.htmlBytes >= 520_000 ? '+' : ''}` : '—'}</div><div class="t">{h.htmlBytes && h.htmlBytes >= 520_000 ? 'read up to 512 KB · ' : ''}{h.compression ? `${h.compression} compressed` : 'not compressed'}</div></div>
      <div class="ss-tile"><div class="k">Protocol</div><div class="v" style="font-size: var(--text-lg)">{protocol(h.protocol)}</div><div class="t">{h.http3 ? 'HTTP/3 advertised' : h.server ?? ''}</div></div>
      <div class="ss-tile"><div class="k">Content</div><div class="v">{words ?? '—'}<small>{words ? ' words' : ''}</small></div><div class="t">{report.seo ? `${report.seo.images.total} images · ${report.seo.links.internal + report.seo.links.external} links` : ''}</div></div>
    </div>
    {#if hops.length > 1}
      <dl class="ss-kv" style="margin-top: var(--space-4)">
        <dt>Redirects</dt><dd>{#each hops as hop}<div class="ss-mono">{hop.location ? `${hop.status} ${hop.url} → ${hop.location}` : `${hop.status} ${hop.url}`}</div>{/each}</dd>
      </dl>
    {/if}
  {/if}

  {#if s?.profiles.length}
    <div class="ss-prev-profiles"><span>Linked profiles</span>{#each s.profiles as p}{#if safeHref(p.url)}<a class="ss-chip" href={safeHref(p.url)} rel="noopener nofollow" target="_blank">{p.network}</a>{/if}{/each}</div>
  {/if}
</Card>
