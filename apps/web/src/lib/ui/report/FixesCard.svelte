<script lang="ts">
  import type { Finding, Report } from '@site-scanner/core/types';
  import Card from './Card.svelte';
  import { issues, platformLabel, TLS_IDS } from './helpers';
  let { report }: { report: Report } = $props();
  let fixes = $derived.by(() => {
    const src: [string, string, Finding[] | undefined][] = [
      ['Security headers', 'headers', report.security.filter((f) => !TLS_IDS.has(f.id))],
      ['HTTPS', 'tls', report.security.filter((f) => TLS_IDS.has(f.id))],
      ['SEO', 'seo', report.seo?.findings],
      ['Email', 'email', report.email],
      ['Domain', 'domain', report.domainChecks],
      ['PHP', 'php', report.php?.findings],
      ['Privacy', 'privacy', report.privacy],
      [platformLabel(report) || 'Platform', 'wordpress', report.cms?.flags]
    ];
    const out: { f: Finding; section: string; id: string }[] = [];
    for (const [section, id, list] of src) for (const f of issues(list)) out.push({ f, section, id });
    if (report.vulnerableLibraries?.length) out.push({ f: { id: 'libs', title: 'Vulnerable JavaScript libraries', status: 'bad', observed: report.vulnerableLibraries.map((l) => `${l.name} ${l.version}`).join(', '), detail: undefined }, section: 'Scripts', id: 'libraries' });
    if (report.exposedSecrets?.length) out.push({ f: { id: 'secrets', title: 'Possible exposed secrets', status: 'bad', observed: `${report.exposedSecrets.length} credential pattern${report.exposedSecrets.length === 1 ? '' : 's'} in delivered code`, detail: undefined }, section: 'Scripts', id: 'libraries' });
    if (report.blocklists?.listed.length) out.push({ f: { id: 'bl', title: 'Listed on a blocklist', status: report.blocklists.listed.some((h) => h.role === 'mail') ? 'bad' : 'warn', observed: report.blocklists.listed.map((h) => `${h.subject} on ${h.list}`).join(', '), detail: undefined }, section: 'Blocklists', id: 'blocklist' });
    if (report.aiReadiness && report.aiReadiness.score < 60) out.push({ f: { id: 'ai', title: 'Hard for AI assistants to use', status: 'warn', observed: `AI readiness ${report.aiReadiness.score}/100`, detail: undefined }, section: 'AI readiness', id: 'ai' });
    return out.sort((a, b) => (a.f.status === b.f.status ? 0 : a.f.status === 'bad' ? -1 : 1));
  });
</script>

<Card id="fixes" title="What to fix" desc={fixes.length ? `${fixes.length} item${fixes.length === 1 ? '' : 's'} across all sections, worst first. Warnings are hardening opportunities, not proof of a vulnerability.` : 'Nothing needs attention.'} chip={fixes.length ? `${fixes.length} to review` : 'All clear'} tone={fixes.some((x) => x.f.status === 'bad') ? 'bad' : fixes.length ? 'warn' : 'good'}>
  {#if fixes.length}
    <div class="ss-find">
      {#each fixes.slice(0, 14) as x (x.section + x.f.id)}
        <a class="ss-frow" href="#s-{x.id}" style="text-decoration: none">
          <span><span class="ss-chip {x.f.status === 'bad' ? 'bad' : 'warn'}">{x.f.status === 'bad' ? 'Fail' : 'Warn'}</span></span>
          <div class="nm">{x.f.title}<span class="cd" style="font-family: var(--font-sans)">{x.section}</span></div>
          <div class="ob">{x.f.observed}</div>
        </a>
      {/each}
    </div>
    {#if fixes.length > 14}<p class="ss-note">+{fixes.length - 14} more in the sections below.</p>{/if}
  {:else}
    <p class="ss-empty">No warnings were found in the sections that could be assessed.</p>
  {/if}
</Card>
