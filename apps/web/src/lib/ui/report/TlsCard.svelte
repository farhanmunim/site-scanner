<script lang="ts">
  import type { CertChainEntry, Report } from '@site-scanner/core/types';
  import { daysUntil, fmtDate } from '$lib/format';
  import Card from './Card.svelte';
  import Findings from './Findings.svelte';
  import { dot, rollup, TLS_IDS } from './helpers';
  let { report, open = false }: { report: Report; open?: boolean } = $props();
  let findings = $derived(report.security.filter((f) => TLS_IDS.has(f.id)));
  let r = $derived(rollup(findings, report.cert ? 'Certificate found' : 'No data'));
  let certDays = $derived(daysUntil(report.cert?.notAfter));
  let certOk = $derived(!!report.tls?.authorized);
  let chain = $derived.by((): (CertChainEntry & { role: string })[] => {
    const c = report.tls?.chain ?? [];
    if (c.length) return [...c].reverse().map((e, i, arr) => ({ ...e, role: i === arr.length - 1 ? 'Leaf' : e.selfSigned || i === 0 ? 'Root CA' : 'Intermediate' }));
    if (report.cert) return [{ subject: report.cert.subject, issuer: report.cert.issuer, notBefore: report.cert.notBefore, notAfter: report.cert.notAfter, keyType: null, keyBits: null, curve: null, selfSigned: false, role: 'Leaf' }];
    return [];
  });
</script>

<Card id="tls" title="HTTPS & certificate" desc={report.tls?.source === 'handshake' ? 'TLS handshake and trust path to a public root.' : report.cert ? 'From Certificate Transparency logs; the handshake could not be completed.' : 'No certificate information available.'} chip={r.label} tone={r.tone}>
  {#if report.cert}
    <div class="ss-tiles">
      <div class="ss-tile {certDays === null ? '' : certDays < 7 ? 'bad' : certDays < 21 ? 'warn' : 'good'}"><div class="k">Expires in</div><div class="v">{certDays ?? '—'}<small>{certDays === null ? '' : ' days'}</small></div><div class="t">{fmtDate(report.cert.notAfter)}</div></div>
      <div class="ss-tile"><div class="k">Protocol</div><div class="v" style="font-size: var(--text-lg)">{report.tls?.protocol ?? '—'}</div><div class="t">{report.tls?.alpn === 'h2' ? 'HTTP/2' : (report.tls?.alpn ?? '')}</div></div>
      <div class="ss-tile {certOk ? 'good' : report.tls ? 'bad' : ''}"><div class="k">Trusted</div><div class="v" style="font-size: var(--text-lg)">{report.tls ? (certOk ? 'Yes' : 'No') : '—'}</div></div>
      <div class="ss-tile"><div class="k">Issuer</div><div class="v" style="font-size: var(--text-base)">{report.cert.issuer ?? '—'}</div><div class="t">{report.cert.sans.length} name{report.cert.sans.length === 1 ? '' : 's'} covered</div></div>
    </div>
  {/if}
  {#if chain.length}
    <div class="ss-chain">
      {#each chain as c, i (i)}
        {@const leaf = c.role === 'Leaf'}
        {@const cls = leaf ? (!certOk || (certDays !== null && certDays < 0) ? 'fail' : certDays !== null && certDays < 21 ? 'warn' : '') : ''}
        <div class="l">
          <span class="ic {cls}" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{#if cls === 'fail'}<path d="m4 4 8 8M12 4l-8 8" />{:else}<path d="m3.5 8.5 3 3 6-7" />{/if}</svg></span>
          <div>
            <b><span class="role">{c.role}</span>{c.subject ?? 'Unknown'}</b>
            {#if leaf}
              <span class="d {cls === 'fail' ? 'bad' : cls === 'warn' ? 'warn' : 'ok'}">{dot(!certOk ? (report.tls?.authorizationError ?? 'Not trusted') : certDays !== null ? (certDays < 0 ? `Expired ${-certDays} days ago` : `Valid (${certDays} days remaining)`) : 'Valid', report.tls?.cipher ?? null)}</span>
              <span class="d">{dot(c.keyType ? `${c.keyType} ${c.curve ?? c.keyBits ?? ''}`.trim() : null, c.issuer ? `Issued by ${c.issuer}` : null)}</span>
            {:else}
              <span class="d">{dot(c.keyType ? `${c.keyType} ${c.curve ?? c.keyBits ?? ''}`.trim() : null, c.selfSigned ? 'Self-signed trust anchor' : c.issuer ? `Signed by ${c.issuer}` : null, c.notAfter ? `Expires ${fmtDate(c.notAfter)}` : null)}</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
  {#if chain.length === 1 && report.tls?.source === 'handshake' && !certOk}<p class="ss-note">Only the site certificate was sent; the intermediate that links it to {report.cert?.issuer ?? 'the issuer'} is missing from the server's configuration.</p>{/if}
  {#if findings.length}<Findings {findings} {open} />{/if}
</Card>
