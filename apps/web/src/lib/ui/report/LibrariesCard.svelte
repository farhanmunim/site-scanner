<script lang="ts">
  import type { Report } from '@site-scanner/core/types';
  import Card from './Card.svelte';
  import type { Tone } from './helpers';
  let { report }: { report: Report } = $props();
  let libs = $derived(report.vulnerableLibraries);
  let secrets = $derived(report.exposedSecrets ?? []);
  let high = $derived(secrets.filter((s) => s.severity === 'high').length);
  let tone = $derived<Tone>(secrets.some((s) => s.severity !== 'low') || (libs ?? []).some((l) => l.vulns.some((v) => /high|critical/i.test(v.severity ?? ''))) ? 'bad' : (libs?.length ?? 0) + secrets.length > 0 ? 'warn' : libs === null || libs === undefined ? '' : 'good');
  const sevTone = (s: string | null) => (/critical|high/i.test(s ?? '') ? 'bad' : /medium/i.test(s ?? '') ? 'warn' : '');
</script>

<Card id="libraries" title="Scripts & secrets" desc="JavaScript libraries with known vulnerabilities (retire.js) and credentials that should never reach a browser." chip={tone === 'good' ? 'All good' : tone === '' ? 'Not assessed' : `${(libs?.length ?? 0) + secrets.length} finding${(libs?.length ?? 0) + secrets.length === 1 ? '' : 's'}`} {tone}>
  <div>
    <div class="sub-h">Vulnerable libraries</div>
    {#if libs === null || libs === undefined}
      <p class="ss-empty">The retire.js database was not available for this scan.</p>
    {:else if !libs.length}
      <p class="ss-empty">No known-vulnerable JavaScript libraries were identified in the scripts we could read.</p>
    {:else}
      <div class="ss-tbl-wrap"><table class="ss-tbl">
        <thead><tr><th>Library</th><th>Version</th><th>Issues</th><th>Found in</th></tr></thead>
        <tbody>
          {#each libs as l (l.name + l.version)}
            <tr>
              <td style="font-weight: var(--weight-medium)">{l.name}</td><td class="ss-mono">{l.version}</td>
              <td>{#each l.vulns as v}<div style="margin-bottom: 6px"><span class="ss-chip {sevTone(v.severity)}">{v.severity ?? 'issue'}</span> {v.summary ?? 'Known vulnerability'}{#if v.cves.length}<span class="ss-mono ss-muted"> · {v.cves.join(', ')}</span>{/if}{#if v.below}<span class="ss-muted"> · fixed in {v.below}</span>{/if}</div>{/each}</td>
              <td class="ss-mono ss-muted">{l.source.length > 60 ? '…' + l.source.slice(-57) : l.source}</td>
            </tr>
          {/each}
        </tbody>
      </table></div>
      <p class="ss-note" style="margin-top: 8px">Only a few scripts per page are read, and versions come from file names and banners, so a library we could not identify may still be outdated.</p>
    {/if}
  </div>
  <div>
    <div class="sub-h">Exposed secrets</div>
    {#if !secrets.length}
      <p class="ss-empty">No credentials matched in the page or the scripts we read. Publishable keys (Stripe pk_, Google Maps) are meant to be public and are ignored.</p>
    {:else}
      <div class="ss-tbl-wrap"><table class="ss-tbl">
        <thead><tr><th>Severity</th><th>Type</th><th>Preview</th><th>Found in</th></tr></thead>
        <tbody>{#each secrets as s}<tr><td><span class="ss-chip {s.severity === 'high' ? 'bad' : s.severity === 'medium' ? 'warn' : ''}">{s.severity}</span></td><td>{s.kind}</td><td class="ss-mono">{s.preview}</td><td class="ss-mono ss-muted">{s.source.length > 60 ? '…' + s.source.slice(-57) : s.source}</td></tr>{/each}</tbody>
      </table></div>
      <p class="ss-note" style="margin-top: 8px">{high ? 'Rotate high-severity keys immediately: anything served to browsers is public. ' : ''}Only a redacted preview is stored; the full value is never kept.</p>
    {/if}
  </div>
</Card>
