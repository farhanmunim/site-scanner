<script lang="ts">
  import type { Report } from '@site-scanner/core/types';
  import { fmtDate } from '$lib/format';
  import Card from './Card.svelte';
  import Findings from './Findings.svelte';
  import { rollup } from './helpers';
  let { report, open = false }: { report: Report; open?: boolean } = $props();
  let php = $derived(report.php);
  let r = $derived(php?.detected ? rollup(php.findings, 'PHP detected') : { tone: '' as const, label: 'Not detected' });
  const src = { header: 'X-Powered-By / Server header', fingerprint: 'Technology fingerprint', url: '.php URLs on the page', cookie: 'PHPSESSID cookie' } as const;
</script>

<Card id="php" title="PHP" desc="Which PHP the site runs and whether that branch still gets security fixes." chip={r.label} tone={r.tone}>
  {#if php?.detected}
    <div class="ss-tiles">
      <div class="ss-tile {php.supported === false ? 'bad' : php.supported ? 'good' : ''}"><div class="k">Version</div><div class="v">{php.version ?? 'Hidden'}</div><div class="t">{php.branch ? `branch ${php.branch}` : 'not publicly visible'}</div></div>
      <div class="ss-tile {php.supported === false ? 'bad' : php.supported ? 'good' : ''}"><div class="k">Security support</div><div class="v" style="font-size: var(--text-lg)">{php.supported === null ? 'Unknown' : php.supported ? 'Supported' : 'Ended'}</div><div class="t">{php.eol ? `${php.supported ? 'until' : 'ended'} ${fmtDate(php.eol)}` : ''}</div></div>
      <div class="ss-tile"><div class="k">Detected from</div><div class="v" style="font-size: var(--text-base)">{php.source ? src[php.source] : '—'}</div></div>
    </div>
    <Findings findings={php.findings} {open} />
  {:else}
    <p class="ss-empty">No sign of PHP: no X-Powered-By header, session cookie or .php links, and no matching fingerprint. The site may use another language, or PHP may be fully hidden.</p>
  {/if}
</Card>
