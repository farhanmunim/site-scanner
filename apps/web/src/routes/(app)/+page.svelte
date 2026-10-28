<script lang="ts">
  import ScanForm from '$lib/ui/ScanForm.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { TOOLS } from '$lib/ui/tools';
  let { form, data } = $props();
</script>

<svelte:head>
  <title>{data.siteName} — Scan any website in one shot</title>
  <meta name="description" content="Domain, DNS, email, security, performance, AI readiness and WordPress checks for any website in one scan. Free, no account, nothing is probed." />
</svelte:head>

<section class="ss-hero">
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
    <li><h4>Enter an address</h4><p>Any public website. Private and internal addresses are refused.</p></li>
    <li><h4>We read the public response</h4><p>The page, standard files like robots.txt, public DNS, registration data and certificate logs: about 25 requests at most.</p></li>
    <li><h4>Get a report you can share</h4><p>A scored summary, what to fix first, and every detail behind it. Export a PDF or send the link.</p></li>
  </ol>
</section>

<section class="ss-wrap ss-sec" id="faq" style="padding-bottom: var(--space-16)">
  <div class="ss-sec-head"><div><span class="eui-eyebrow">FAQ</span><h2>Questions</h2></div></div>
  <div class="ss-faq">
    <details><summary>Does it touch my server?</summary><div class="ans">Only with ordinary read requests for your homepage and a few standard files. DNS, certificates, registration, blocklists and performance come from public sources. See <a href="/bot">how the scanner behaves</a>.</div></details>
    <details><summary>Why doesn't it check for exposed .env files or open ports?</summary><div class="ans">Those need active probing, which is what attacker scanners do. This tool stays passive on purpose, so it is safe to point at any site and will never get your IP blocklisted.</div></details>
    <details><summary>Where do the subdomains come from?</summary><div class="ans">From public Certificate Transparency logs: every hostname that has ever had a TLS certificate issued. Nothing is probed, so a few names may no longer exist.</div></details>
    <details><summary>Is it free? Do I need an account?</summary><div class="ans">Free, no account. A Cloudflare human check may appear to keep automated abuse out.</div></details>
    <details><summary>Who can see my report?</summary><div class="ans">Anyone with the link. Reports are unguessable, unlisted and marked noindex. <a href="/privacy">What is stored</a>.</div></details>
  </div>
</section>
