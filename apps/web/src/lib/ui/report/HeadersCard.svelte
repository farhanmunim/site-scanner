<script lang="ts">
  import type { Report } from '@site-scanner/core/types';
  import Card from './Card.svelte';
  import Findings from './Findings.svelte';
  import { rollup, TLS_IDS } from './helpers';
  let { report, open = false }: { report: Report; open?: boolean } = $props();
  const CODES: Record<string, string> = { csp: 'Content-Security-Policy', xcto: 'X-Content-Type-Options', framing: 'X-Frame-Options', referrer: 'Referrer-Policy', permissions: 'Permissions-Policy', coop: 'Cross-Origin-Opener-Policy', cookies: 'Set-Cookie', sri: 'Subresource Integrity', 'version-disclosure': 'Server / X-Powered-By', 'mixed-content': 'Mixed content', 'login-page': 'Login page', 'password-form-http': 'Password form', 'safe-browsing': 'Safe Browsing' };
  let findings = $derived(report.security.filter((f) => !TLS_IDS.has(f.id)));
  let r = $derived(rollup(findings, 'No page response'));
</script>

<Card id="headers" title="Security headers" desc={report.profile && !report.profile.interactive ? 'Browser-isolation headers (CSP, clickjacking, COOP) protect logins and sessions; this site has none, so they are listed as low impact and not scored.' : 'Directives on the homepage response. Warnings are hardening opportunities, not proof of a vulnerability.'} chip={r.label} tone={r.tone}>
  <Findings {findings} codes={CODES} {open} empty="No page response to assess." />
  {#if report.cookies.length}
    <details class="ss-fold" {open}>
      <summary>{report.cookies.length} cookie{report.cookies.length === 1 ? '' : 's'} set on arrival</summary>
      <div class="in ss-tbl-wrap"><table class="ss-tbl">
        <thead><tr><th>Name</th><th>Set by</th><th>Secure</th><th>HttpOnly</th><th>SameSite</th><th>Lasts</th></tr></thead>
        <tbody>{#each report.cookies as c}<tr><td class="ss-mono">{c.name}</td><td class="ss-mono">{c.domain}{c.thirdParty ? ' (third party)' : ''}</td><td>{c.secure ? 'Yes' : 'No'}</td><td>{c.httpOnly ? 'Yes' : 'No'}</td><td>{c.sameSite ?? '—'}</td><td>{c.session ? 'This visit' : 'Persists'}</td></tr>{/each}</tbody>
      </table></div>
    </details>
  {/if}
</Card>
