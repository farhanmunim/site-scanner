<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { TOOLS } from '$lib/ui/tools';
  let { data } = $props();
</script>

<svelte:head><title>Tools — {data.siteName}</title><meta name="description" content="Focused website, DNS, email, security and WordPress checks." /></svelte:head>

<div class="ss-wrap">
  <div class="ss-toolhead">
    <span class="eui-eyebrow">Tools</span>
    <h1>Website and domain tools</h1>
    <p>Each tool runs the same passive scan and shows only the part you need. The full report is one click away.</p>
  </div>
  <div class="ss-grid" style="padding-bottom: var(--space-16)">
    {#each TOOLS as t (t.slug)}
      <a class="ss-tool" class:feat={t.featured} href="/tools/{t.slug}">
        <span class="ico"><Icon name={t.icon} size={18} /></span>
        <h3>{t.title}</h3>
        <p>{t.short}</p>
        <span class="go">Open tool <Icon name="arrow" size={12} /></span>
      </a>
    {/each}
  </div>
</div>
