<script lang="ts">
  import ScanForm from '$lib/ui/ScanForm.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { TOOLS } from '$lib/ui/tools';
  let { data } = $props();
  let t = $derived(data.tool);
  let others = $derived(TOOLS.filter((x) => x.slug !== t.slug).slice(0, 6));
</script>

<svelte:head>
  <title>{t.title} — {data.siteName}</title>
  <meta name="description" content={t.description} />
  <meta property="og:title" content="{t.title} — {data.siteName}" />
  <meta property="og:description" content={t.short} />
</svelte:head>

<div class="ss-wrap">
  <div class="ss-toolhead">
    <span class="eui-eyebrow">Tool</span>
    <h1>{t.title}</h1>
    <p>{t.description}</p>
  </div>
  <div style="max-width: 640px"><ScanForm initial={data.prefill} tool={t.slug} turnstileSiteKey={data.turnstileSiteKey} label="Run {t.title.replace(/ (Checker|Inspector|Finder|Detector|Scanner)$/, '')}" /></div>

  <section class="ss-sec">
    <h2 class="eui-sr">What it checks</h2>
    <div class="ss-sec-head"><div><span class="eui-eyebrow" aria-hidden="true">What it checks</span></div></div>
    <ul class="ss-checks">{#each t.checks as c}<li><Icon name="check" size={14} /><span>{c}</span></li>{/each}</ul>
  </section>

  <section class="ss-sec" style="padding-bottom: var(--space-16)">
    <h2 class="eui-sr">More tools</h2>
    <div class="ss-sec-head"><div><span class="eui-eyebrow" aria-hidden="true">More tools</span></div><a class="eui-btn outline sm" href="/tools">All tools <Icon name="arrow" size={14} /></a></div>
    <div class="ss-grid">
      {#each others as o (o.slug)}
        <a class="ss-tool" href="/tools/{o.slug}"><span class="ico"><Icon name={o.icon} size={18} /></span><h3>{o.title}</h3><p>{o.short}</p><span class="go">Open tool <Icon name="arrow" size={12} /></span></a>
      {/each}
    </div>
  </section>
</div>
