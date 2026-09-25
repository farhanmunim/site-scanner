<script lang="ts">
  import { enhance } from '$app/forms';
  let { form, data } = $props();
  let busy = $state(false);
</script>

<svelte:head>
  <title>{data.siteName} — How is this website built?</title>
  <meta name="description" content="Evidence-backed website intelligence: technology stack, CMS and plugins, hosting and CDN, DNS and email security, HTTP security headers, SEO, performance and third-party services." />
  {#if data.turnstileSiteKey}<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>{/if}
</svelte:head>

<div class="hero">
  <h1>How is this website built?</h1>
  <p>Enter any public website. We'll show the technology stack, hosting and CDN, DNS and email security, security headers, SEO signals, performance and third-party services — with the evidence for every claim.</p>
  <form method="POST" class="scan-form" use:enhance={() => { busy = true; return async ({ update }) => { busy = false; await update(); }; }}>
    <label class="sr-only" for="url">Website address</label>
    <input id="url" name="url" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="example.com" value={form?.input ?? ''} required />
    {#if data.turnstileSiteKey}<div class="cf-turnstile" data-sitekey={data.turnstileSiteKey} data-size="flexible"></div>{/if}
    <button class="primary" type="submit" disabled={busy}>{busy ? 'Starting…' : 'Analyse'}</button>
  </form>
  {#if form?.error}<p class="alert bad" role="alert" style="max-width: 640px; margin: 12px auto 0">{form.error}</p>{/if}
</div>

<div class="grid" style="margin-top: 24px">
  <div class="card"><h3>Technology, with evidence</h3><p class="muted small">CMS, frameworks, libraries, analytics, payments and more — each with the header, markup or script that gave it away, and a confidence level. Unknown is a valid answer.</p></div>
  <div class="card"><h3>Infrastructure</h3><p class="muted small">CDN, WAF, hosting provider, IP and ASN, DNS provider, registrar, certificate. CDN and origin are kept separate: Cloudflare in front does not mean Cloudflare hosting.</p></div>
  <div class="card"><h3>Security configuration</h3><p class="muted small">HTTPS, HSTS, CSP quality, cookie flags, framing protection, SPF/DKIM/DMARC and Safe Browsing status. Described factually, mapped to OWASP categories, never dramatised.</p></div>
  <div class="card"><h3>WordPress &amp; Shopify deep dive</h3><p class="muted small">Core version, theme, plugins with versions, out-of-date or abandoned plugins and published advisories, using only files the page itself references.</p></div>
  <div class="card"><h3>SEO, performance, privacy</h3><p class="muted small">Titles, canonical, robots, sitemap, Open Graph, structured data; Lighthouse scores and Core Web Vitals via PageSpeed Insights; trackers, cookies and consent tooling.</p></div>
  <div class="card"><h3>Polite by design</h3><p class="muted small">Read-only requests, an honest bot name, a hard cap of ~25 requests per scan, no retries when a site says no, and an opt-out for site owners. <a href="/bot">How it works</a>.</p></div>
</div>
