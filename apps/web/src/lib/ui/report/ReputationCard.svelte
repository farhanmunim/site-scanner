<script lang="ts">
  import type { Report } from '@site-scanner/core/types';
  import Card from './Card.svelte';
  import Findings from './Findings.svelte';
  import { rollup } from './helpers';
  let { report, open = false, running = false }: { report: Report; open?: boolean; running?: boolean } = $props();
  let rep = $derived(report.reputation);
  let d = $derived(rep?.data);
  let r = $derived(rollup(rep?.findings, running ? 'Checking…' : 'Not checked'));
  const LABEL = { virustotal: 'VirusTotal', abuseipdb: 'AbuseIPDB', otx: 'AlienVault OTX', urlhaus: 'URLhaus' } as const;
</script>

<Card id="reputation" title="Reputation" desc="What threat-intelligence services say about this domain and its server. Their opinions, not ours." chip={r.label} tone={r.tone}>
  {#if rep && d}
    <div class="ss-tiles">
      {#if d.asked.includes('virustotal')}<div class="ss-tile {d.virustotal ? (d.virustotal.malicious >= 3 ? 'bad' : d.virustotal.malicious + d.virustotal.suspicious ? 'warn' : 'good') : ''}"><div class="k">VirusTotal</div><div class="v">{d.virustotal ? d.virustotal.malicious + d.virustotal.suspicious : '—'}<small>{d.virustotal ? ` / ${d.virustotal.engines}` : ''}</small></div><div class="t">{d.virustotal ? 'engines flagging' : 'unavailable'}</div></div>{/if}
      {#if d.asked.includes('urlhaus')}<div class="ss-tile {d.urlhaus ? (d.urlhaus.urlsOnline ? 'bad' : d.urlhaus.listed ? 'warn' : 'good') : ''}"><div class="k">URLhaus</div><div class="v">{d.urlhaus ? d.urlhaus.urlCount : '—'}</div><div class="t">{d.urlhaus ? (d.urlhaus.urlsOnline ? `${d.urlhaus.urlsOnline} online now` : 'malware URLs on record') : 'unavailable'}</div></div>{/if}
      {#if d.asked.includes('abuseipdb')}{@const worst = d.abuseipdb?.slice().sort((a, b) => b.score - a.score)[0]}<div class="ss-tile {worst ? (worst.score >= 75 ? 'bad' : worst.score >= 25 ? 'warn' : 'good') : ''}"><div class="k">AbuseIPDB</div><div class="v">{worst ? `${worst.score}%` : '—'}</div><div class="t">{worst ? 'abuse confidence' : d.abuseipdb ? 'behind a CDN' : 'unavailable'}</div></div>{/if}
      {#if d.asked.includes('otx')}<div class="ss-tile {d.otx ? (d.otx.pulses >= 5 ? 'warn' : '') : ''}"><div class="k">AlienVault OTX</div><div class="v">{d.otx ? d.otx.pulses : '—'}</div><div class="t">{d.otx ? 'threat reports' : 'unavailable'}</div></div>{/if}
    </div>
    <Findings findings={rep.findings} {open} />
    {#if d.urlhaus?.blacklists.length || d.virustotal?.categories.length}
      <p class="ss-note">{[d.urlhaus?.blacklists.length ? `URLhaus blocklists: ${d.urlhaus.blacklists.join(', ')}.` : '', d.virustotal?.categories.length ? `VirusTotal categories: ${d.virustotal.categories.join(', ')}.` : ''].filter(Boolean).join(' ')}</p>
    {/if}
    <p class="ss-note">Sources asked: {d.asked.map((a) => LABEL[a]).join(', ')}. Only the domain or server IP was sent, never page content. Free-tier limits mean a source can be briefly unavailable.</p>
  {:else}
    <p class="ss-empty">{running ? 'Asking the threat-intelligence services…' : 'No reputation sources are configured on this server.'}</p>
  {/if}
</Card>
