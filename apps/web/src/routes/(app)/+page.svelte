<script lang="ts">
  import ScanForm from '$lib/ui/ScanForm.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { TOOLS } from '$lib/ui/tools';
  let { form, data } = $props();
</script>

<svelte:head>
  <title>{data.siteName} — Scan any website in one shot</title>
  <meta name="description" content="Domain, DNS, email, security, performance, AI readiness and WordPress checks for any website in one scan. Free, no account, nothing is probed." />
  <meta property="og:title" content="{data.siteName} — Scan any website in one shot" />
  <meta property="og:description" content="Domain, DNS, email, security, performance and AI readiness checks in one passive scan. Free, no account." />
</svelte:head>

<section class="ss-hero" id="scan">
  <div class="ss-wrap">
    <span class="ss-pill"><i></i>Passive · no login · reads public data only</span>
    <h1>Scan any website in one shot</h1>
    <p class="lede">Domain, DNS, email, security headers, performance, AI readiness and WordPress health. In plain language, with the evidence behind every finding.</p>
    <ScanForm initial={form?.input ?? data.prefill} autostart={data.autostart} tool={data.tool} turnstileSiteKey={data.turnstileSiteKey} error={form?.error ?? null} />
    <div class="ss-stats">
      <div><b>{TOOLS.length}</b><span>Focused tools</span></div>
      <div><b>~25</b><span>Requests per scan</span></div>
      <div><b>0</b><span>Probes or payloads</span></div>
    </div>
  </div>
</section>

<section class="ss-wrap ss-sec" id="tools">
  <div class="ss-sec-head">
    <div><span class="eui-eyebrow">Tools</span><h2>Or run a focused check</h2><p>Every tool is the same scan, filtered to what you came for. Start anywhere and open the full report later.</p></div>
    <a class="eui-btn outline sm" href="/tools">All tools <Icon name="arrow" size={14} /></a>
  </div>
  <div class="ss-grid">
    {#each TOOLS as t (t.slug)}
      <a class="ss-tool" class:feat={t.featured} href="/tools/{t.slug}">
        <span class="ico"><Icon name={t.icon} size={18} /></span>
        <h3>{t.title}</h3>
        <p>{t.short}</p>
        <span class="go">Open tool <Icon name="arrow" size={12} /></span>
      </a>
    {/each}
  </div>
</section>

<section class="ss-wrap ss-sec" id="how">
  <div class="ss-sec-head"><div><span class="eui-eyebrow">How it works</span><h2>Read like a browser would</h2><p>It never logs in, guesses hidden paths or sends attack payloads.</p></div></div>
  <ol class="ss-steps">
    <li><h3>Enter an address</h3><p>Any public website. Private and internal addresses are refused.</p></li>
    <li><h3>We read the public response</h3><p>The page, standard files like robots.txt, public DNS, registration data and certificate logs: about 25 requests at most.</p></li>
    <li><h3>Get a report you can share</h3><p>A scored summary, what to fix first, and every detail behind it. Export a PDF or send the link.</p></li>
  </ol>
</section>

<section class="ss-wrap ss-sec" id="faq">
  <div class="ss-faqsplit">
    <div class="intro">
      <span class="eui-eyebrow">FAQ</span>
      <h2>Questions, answered</h2>
      <p>What the scanner does to your site, what it deliberately never does, and what happens to your report.</p>
      <div class="ss-row" style="margin-top: var(--space-5)">
        <a class="eui-btn outline sm" href="/bot">How it behaves <Icon name="arrow" size={13} /></a>
        <a class="eui-btn ghost sm" href="/privacy">Privacy</a>
      </div>
    </div>
    <div class="ss-faq">
      <details open><summary>Does it touch my server?</summary><div class="ans">Only with ordinary read requests for your homepage and a few standard files, about 25 at most. DNS, certificates, registration, blocklists and performance come from public sources. See <a href="/bot">how the scanner behaves</a>.</div></details>
      <details><summary>Why doesn't it check for exposed .env files or open ports?</summary><div class="ans">Those need active probing, which is what attacker scanners do. This tool stays passive on purpose, so it is safe to point at any site and will never get your IP blocklisted.</div></details>
      <details><summary>Where do the subdomains come from?</summary><div class="ans">From public Certificate Transparency logs: every hostname that has ever had a TLS certificate issued. Nothing is probed, so a few names may no longer exist.</div></details>
      <details><summary>Is it free? Do I need an account?</summary><div class="ans">Free, no account. A Cloudflare human check may appear to keep automated abuse out.</div></details>
      <details><summary>Who can see my report?</summary><div class="ans">Anyone with the link. Reports are unguessable, unlisted and marked noindex. <a href="/privacy">What is stored</a>.</div></details>
      <details><summary>Can I opt my site out?</summary><div class="ans">Yes. Email the operator and the domain, with all of its subdomains, is refused from then on. Details on <a href="/bot#opt-out">the how-it-works page</a>.</div></details>
    </div>
  </div>
</section>

<section class="ss-wrap" style="padding-bottom: var(--space-16)">
  <div class="ss-cta">
    <div>
      <h2>Check a website in under a minute</h2>
      <p>No account, nothing installed, nothing probed. Start with the whole picture, or pick one tool.</p>
    </div>
    <div class="ss-row"><a class="eui-btn lg" href="#scan"><Icon name="search" />Scan a website</a><a class="eui-btn outline lg" href="/tools">Browse tools</a></div>
  </div>
</section>
