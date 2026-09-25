<script lang="ts">
  import type { Finding } from '@site-scanner/core/types';
  import { statusLabel } from '$lib/format';
  import Evidence from './Evidence.svelte';
  let { finding }: { finding: Finding } = $props();
</script>

<div class="finding" id={finding.id}>
  <div><span class="pill {finding.status}">{statusLabel[finding.status] ?? finding.status}</span></div>
  <div>
    <div class="title">{finding.title} {#if finding.owasp}<span class="pill neutral" title="OWASP Top 10 (2021) category">{finding.owasp}</span>{/if}</div>
    <div>{finding.observed}</div>
    {#if finding.detail}<div class="detail">{finding.detail}</div>{/if}
    {#if finding.evidence?.length}
      <details><summary>Evidence</summary><Evidence items={finding.evidence} /></details>
    {/if}
  </div>
</div>
