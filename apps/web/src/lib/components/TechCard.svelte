<script lang="ts">
  import type { TechnologyDetection } from '@site-scanner/core/types';
  import Evidence from './Evidence.svelte';
  let { tech }: { tech: TechnologyDetection } = $props();
  const conf = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' } as const;
</script>

<div class="tech">
  <div class="row" style="justify-content: space-between; gap: 6px">
    <span class="name">{#if tech.website}<a href={tech.website} rel="noopener nofollow" target="_blank">{tech.name}</a>{:else}{tech.name}{/if}{#if tech.version}<span class="muted"> {tech.version}</span>{/if}</span>
    <span class="pill {tech.confidence}">{conf[tech.confidence]}</span>
  </div>
  <div class="cat">{tech.categories.map((c) => c.name).join(' · ')}{#if tech.implied} · implied{/if}</div>
  <details>
    <summary>Why we think so</summary>
    {#if tech.description}<p class="small muted">{tech.description}</p>{/if}
    <Evidence items={tech.evidence} />
  </details>
</div>
