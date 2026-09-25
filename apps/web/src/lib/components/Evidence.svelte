<script lang="ts">
  import type { Evidence } from '@site-scanner/core/types';
  let { items }: { items: Evidence[] } = $props();
  const label: Record<string, string> = { header: 'HTTP header', cookie: 'Cookie', html: 'HTML', meta: 'Meta tag', 'script-src': 'Script URL', 'script-content': 'Script content', url: 'URL', dns: 'DNS', dom: 'DOM', cert: 'Certificate', text: 'Page text', implied: 'Implied', ip: 'IP / ASN', file: 'File' };
</script>

<ul class="evidence">
  {#each items as e}
    <li>
      <span class="src">{label[e.source] ?? e.source}{#if e.key}&nbsp;<code>{e.key}</code>{/if}</span>
      <code>{e.value}</code>
      {#if e.pattern && e.pattern !== '(present)' && e.pattern !== '(exists)'}<span class="muted small"> · matched <code>{e.pattern}</code></span>{/if}
    </li>
  {/each}
</ul>
