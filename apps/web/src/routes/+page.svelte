<script lang="ts">
  import { enhance } from '$app/forms';
  let { form, data } = $props();
  let busy = $state(false);
</script>

<svelte:head>
  <title>{data.siteName} — How is this website built?</title>
  <meta name="description" content="Enter any website and see what it's built with, where it's hosted, how secure its setup is, and how it performs — with the evidence for every claim." />
  {#if data.turnstileSiteKey}<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>{/if}
</svelte:head>

<div class="hero">
  <h1>How is this website built?</h1>
  <p>Enter any website. You'll get a plain-English report on what it's built with, where it's hosted, how secure its setup is, how it performs and who it shares data with.</p>
  <form method="POST" class="scan-form" use:enhance={() => { busy = true; return async ({ update }) => { busy = false; await update(); }; }}>
    <label class="sr-only" for="url">Website address</label>
    <input id="url" name="url" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="example.com" value={form?.input ?? ''} required />
    <button class="primary" type="submit" disabled={busy}>{busy ? 'Starting…' : 'Analyse'}</button>
    {#if data.turnstileSiteKey}<div class="cf-turnstile" data-sitekey={data.turnstileSiteKey} data-size="flexible"></div>{/if}
  </form>
  {#if form?.error}<p class="alert red" role="alert" style="max-width: 620px; margin: 12px auto 0">{form.error}</p>{/if}
</div>

<div class="panel features">
  <header><h2>What the report covers</h2><span class="hint">Takes 10–40 seconds</span></header>
  <table>
    <tbody>
      <tr><td>Technology</td><td>CMS, frameworks, libraries, analytics, payments — each with the evidence and a confidence level.</td></tr>
      <tr><td>Hosting &amp; infrastructure</td><td>CDN, firewall, hosting provider, IP and network, DNS provider, registrar, certificate.</td></tr>
      <tr><td>Security setup</td><td>HTTPS, security headers, cookies, email spoofing protection and Google Safe Browsing — as a simple traffic light.</td></tr>
      <tr><td>WordPress &amp; Shopify</td><td>Version, theme, plugins, and whether any are out of date or have known security issues.</td></tr>
      <tr><td>SEO &amp; performance</td><td>Titles, descriptions, sitemap, social previews; Lighthouse scores and Core Web Vitals.</td></tr>
      <tr><td>Privacy</td><td>Trackers, ad pixels, cookies set on arrival, consent banner, third-party services.</td></tr>
    </tbody>
  </table>
  <p class="note">Read-only: the scanner only loads pages a normal visitor would, never logs in or probes for hidden files. <a href="/bot">How it works and how to opt out</a>.</p>
</div>
