<script lang="ts">
  import { enhance } from '$app/forms';
  import Turnstile from '$lib/components/Turnstile.svelte';
  let { form, data } = $props();
  let busy = $state(false);
  let turnstile: Turnstile | undefined = $state();
</script>

<svelte:head>
  <title>{data.siteName} — How is this website built?</title>
  <meta name="description" content="Enter any website and see what it's built with, where it's hosted, how secure its setup is, and how it performs — with the evidence for every claim." />
</svelte:head>

<div class="hero">
  <h1>How is this website built?</h1>
  <p>Enter any website for a plain-English report on what it's built with, where it's hosted, how secure its setup is, how fast it is and who it shares data with.</p>
  <form method="POST" class="scan-form" use:enhance={() => { busy = true; return async ({ update }) => { busy = false; await update(); turnstile?.reset(); }; }}>
    <label class="sr-only" for="url">Website address</label>
    <input id="url" name="url" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="example.com" value={form?.input ?? data.prefill ?? ''} required autofocus />
    <button class="primary" type="submit" disabled={busy}>{busy ? 'Starting…' : 'Analyse'}</button>
    {#if data.turnstileSiteKey}<Turnstile bind:this={turnstile} siteKey={data.turnstileSiteKey} />{/if}
  </form>
  {#if form?.error}<p class="alert red" role="alert">{form.error}</p>{/if}
  <p class="muted small hint">Takes 10–40 seconds. No account needed.</p>
</div>

<div class="features">
  <div><h3>Technology</h3><p>CMS, frameworks, libraries, analytics and payments — each with the evidence and a confidence level.</p></div>
  <div><h3>Hosting &amp; infrastructure</h3><p>CDN, firewall, hosting provider, IP and network, DNS provider, registrar and certificate.</p></div>
  <div><h3>Security setup</h3><p>HTTPS, security headers, cookies, email spoofing protection and Safe Browsing — as a simple traffic light.</p></div>
  <div><h3>WordPress &amp; Shopify</h3><p>Version, theme and plugins, and whether any are out of date or have known security issues.</p></div>
  <div><h3>SEO &amp; performance</h3><p>Titles, descriptions, sitemap and social previews; Lighthouse scores and Core Web Vitals.</p></div>
  <div><h3>Privacy</h3><p>Trackers, ad pixels, cookies set on arrival, consent banner and third-party services.</p></div>
</div>
