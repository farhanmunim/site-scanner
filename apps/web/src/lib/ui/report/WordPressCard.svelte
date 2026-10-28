<script lang="ts">
  import type { Report } from '@site-scanner/core/types';
  import Card from './Card.svelte';
  import Findings from './Findings.svelte';
  import { dot, platformLabel, rollup } from './helpers';
  let { report, open = false }: { report: Report; open?: boolean } = $props();
  let cms = $derived(report.cms);
  let pv = $derived(report.platform);
  let name = $derived(platformLabel(report) || pv?.name || '');
  const kindLabel = { builder: 'website builder', cms: 'CMS', ecommerce: 'online shop', framework: 'framework' } as const;
  let r = $derived(rollup(cms?.flags, name || 'Not detected'));
  let wp = $derived(cms?.platform === 'wordpress');
  let hits = $derived(cms?.vulnerabilities?.filter((v) => v.affectsInstalled === true) ?? []);
  let themeLine = $derived(cms?.theme ? dot(`${cms.theme.name ?? cms.theme.slug}${cms.theme.version ? ` ${cms.theme.version}` : ''}`, cms.theme.author ? `by ${cms.theme.author}` : null) : '');
  let latestNote = $derived(cms?.latestVersion && cms.version ? (cms.latestVersion === cms.version ? 'current' : `latest ${cms.latestVersion}`) : '');
</script>

<Card id="wordpress" title={cms || !pv ? name || 'Platform' : 'Platform'} desc={cms ? (wp ? 'Version, theme and plugins visible from the homepage, matched against known vulnerabilities.' : 'Theme and apps visible from the homepage.') : 'What the site is built with. WordPress and Shopify sites get a deeper check.'} chip={cms ? r.label : pv ? pv.name : 'Custom or unknown'} tone={cms ? r.tone : ''}>
  {#if cms}
    <div class="ss-tiles">
      <div class="ss-tile"><div class="k">Version</div><div class="v">{cms.version ?? 'Hidden'}</div><div class="t">{latestNote}</div></div>
      {#if wp}<div class="ss-tile {hits.length ? 'bad' : cms.vulnerabilities ? 'good' : ''}"><div class="k">Known vulnerabilities</div><div class="v">{cms.vulnerabilities ? hits.length : '—'}</div><div class="t">{cms.vulnerabilities ? 'in installed versions' : 'needs a Wordfence key'}</div></div>{/if}
      <div class="ss-tile"><div class="k">{wp ? 'Plugins' : 'Apps'}</div><div class="v">{cms.plugins.length}</div><div class="t">{cms.plugins.filter((p) => p.version).length} with a visible version</div></div>
      <div class="ss-tile"><div class="k">Theme</div><div class="v" style="font-size: var(--text-base)">{cms.theme?.name ?? cms.theme?.slug ?? '—'}</div><div class="t">{cms.theme?.version ?? ''}</div></div>
    </div>
    {#if cms.flags.length}<Findings findings={cms.flags} {open} />{/if}
    {#if wp && cms.vulnerabilities?.length}
      <details class="ss-fold" open={open || hits.length > 0}>
        <summary>{cms.vulnerabilities.length} advisor{cms.vulnerabilities.length === 1 ? 'y' : 'ies'} on record · {hits.length} affect the installed version{hits.length === 1 ? '' : 's'}</summary>
        <div class="in ss-tbl-wrap"><table class="ss-tbl">
          <thead><tr><th>Component</th><th>Installed</th><th>Advisory</th><th>Fixed in</th><th>Affected</th></tr></thead>
          <tbody>{#each cms.vulnerabilities as v}<tr><td class="ss-mono">{v.component}:{v.slug}</td><td class="ss-mono">{v.version ?? '?'}</td><td>{v.title}{#if v.cve}<div class="ss-mono ss-muted">{v.cve}{v.cvss ? ` · CVSS ${v.cvss}` : ''}</div>{/if}</td><td class="ss-mono">{v.fixedIn ?? '—'}</td><td><span class="ss-chip {v.affectsInstalled === true ? 'bad' : v.affectsInstalled === false ? 'good' : ''}">{v.affectsInstalled === true ? 'Yes' : v.affectsInstalled === false ? 'No' : 'Unknown'}</span></td></tr>{/each}</tbody>
        </table></div>
      </details>
    {/if}
    {#if cms.theme || cms.plugins.length}
      <details class="ss-fold" {open}>
        <summary>{[cms.theme ? 'Theme' : null, cms.plugins.length ? `${cms.plugins.length} ${wp ? 'plugins' : 'apps'}` : null].filter(Boolean).join(' and ')}</summary>
        <div class="in ss-tbl-wrap"><table class="ss-tbl">
          <thead><tr><th>Component</th><th>Name</th><th>Version</th><th>Slug</th></tr></thead>
          <tbody>
            {#if cms.theme}<tr><td class="ss-mono">theme</td><td>{themeLine}</td><td class="ss-mono">{cms.theme.version ?? '—'}</td><td class="ss-mono">{cms.theme.slug}</td></tr>{/if}
            {#each cms.plugins as p (p.slug)}<tr><td class="ss-mono">{wp ? 'plugin' : 'app'}</td><td>{p.name ?? '—'}{#if p.vulnerable} <span class="ss-chip bad">vulnerable</span>{/if}</td><td class="ss-mono">{p.version ?? '—'}</td><td class="ss-mono">{p.slug}</td></tr>{/each}
          </tbody>
        </table></div>
      </details>
    {:else}
      <p class="ss-note">The site runs {name}, but it doesn't reveal its version, theme or {wp ? 'plugins' : 'apps'} from the homepage. That's normal for a hardened or heavily customised setup.</p>
    {/if}
  {:else}
    {#if pv}
      <div class="ss-tiles">
        <div class="ss-tile"><div class="k">Built with</div><div class="v" style="font-size: var(--text-base)">{pv.name}</div><div class="t">{kindLabel[pv.kind]}{pv.version ? ` · ${pv.version}` : ''}</div></div>
        <div class="ss-tile"><div class="k">Confidence</div><div class="v" style="font-size: var(--text-base)">{pv.confidence === 'high' ? 'Certain' : pv.confidence === 'medium' ? 'Likely' : 'Possible'}</div><div class="t">{pv.evidence}</div></div>
      </div>
      <p class="ss-note">This is read from the page's markup, headers and scripts. Hosted builders such as {pv.name} do not expose a plugin list, so there are no per-component checks.{#if pv.alternatives.length} Other signals: {pv.alternatives.join(', ')}.{/if}</p>
    {:else}
      <p class="ss-empty">No CMS, online shop or website builder was recognised. The site may be hand-coded, use a framework, or hide its stack.</p>
    {/if}
  {/if}
</Card>
