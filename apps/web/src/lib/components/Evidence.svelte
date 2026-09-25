<script lang="ts">
  import type { Evidence } from '@site-scanner/core/types';
  let { items }: { items: Evidence[] } = $props();
  const label: Record<string, string> = { header: 'Response header', cookie: 'Cookie', html: 'Page source', meta: 'Meta tag', 'script-src': 'Script address', 'script-content': 'Inside a script', url: 'Address', dns: 'DNS record', dom: 'Page element', cert: 'Certificate', text: 'Page text', implied: 'Implied', ip: 'IP address', file: 'File' };
</script>

<ul class="evidence">
  {#each items as e}
    <li>
      <span class="src">{label[e.source] ?? e.source}{#if e.key}&nbsp;<code>{e.key}</code>{/if}</span>
      <code>{e.value}</code>
    </li>
  {/each}
</ul>
