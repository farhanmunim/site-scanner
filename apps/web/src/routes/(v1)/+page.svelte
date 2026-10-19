<script lang="ts">
  import { goto } from '$app/navigation';
  import Turnstile from '$lib/components/Turnstile.svelte';
  import ScanModal from '$lib/components/ScanModal.svelte';
  let { form, data } = $props();
  let value = $state('');
  let busy = $state(false);
  let checking = $state(false);
  let error = $state<string | null>(null);
  let scan = $state<{ id: string; host: string } | null>(null);
  let turnstile: Turnstile | undefined = $state();
  let input: HTMLInputElement | undefined = $state();
  $effect(() => {
    value = form?.input ?? data.prefill ?? '';
  });
  const examples = ['wikipedia.org', 'github.com', 'bbc.co.uk', 'shopify.com'];
  const clean = (v: string) => v.trim().replace(/^https?:\/\//i, '');

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const url = clean(value);
    if (!url) {
      error = 'Enter a website address.';
      input?.focus();
      return;
    }
    busy = true;
    error = null;
    try {
      let token: string | undefined;
      if (turnstile) {
        checking = true;
        token = (await turnstile.waitForToken()) ?? undefined;
        checking = false;
        if (!token) {
          error = 'The human check did not complete. Please wait a moment and try again.';
          turnstile.reset();
          return;
        }
      }
      const r = await fetch('/api/scans', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'x-scan-source': 'web' }, body: JSON.stringify({ url, turnstileToken: token }) });
      const j = (await r.json()) as { scanId?: string; cached?: boolean; notice?: string | null; error?: string };
      if (!r.ok || !j.scanId) {
        error = j.error ?? 'Something went wrong. Please try again.';
        turnstile?.reset();
        return;
      }
      if (j.cached) {
        await goto(`/r/${j.scanId}${j.notice ? `?notice=${encodeURIComponent(j.notice)}` : ''}`);
        return;
      }
      scan = { id: j.scanId, host: url.replace(/[/?#].*$/, '') };
    } catch {
      error = 'Could not reach the scanner. Check your connection and try again.';
    } finally {
      busy = false;
      checking = false;
    }
  }
</script>

<svelte:head>
  <title>{data.siteName} — How is this website built?</title>
  <meta name="description" content="Enter any website and get a plain-language report on what it's built with, where it's hosted, how secure its setup is and how fast it is." />
</svelte:head>

<section class="hero">
  <div class="status-pill"><i aria-hidden="true"></i><span>Scanner online · free, no account needed</span></div>
  <h1>How is this website built?</h1>
  <p>Enter any address for a plain-language report: technology stack, hosting, security headers, certificate chain, Core Web Vitals, email protection and who it shares data with.</p>
  <form method="POST" onsubmit={submit} novalidate>
    <div class="scanner">
      <div class="row">
        <div class="prefix" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg><span>https://</span></div>
        <label class="sr-only" for="url">Website address</label>
        <input id="url" name="url" class="urlfield" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Enter any domain…" bind:value bind:this={input} required autofocus />
        <span class="kbd" aria-hidden="true">↵ Enter</span>
      </div>
      <button type="submit" class="btn btn-primary btn-scan" disabled={busy}>{checking ? 'Checking…' : busy ? 'Starting…' : 'Start scan'}{#if !busy}<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>{/if}</button>
    </div>
    {#if data.turnstileSiteKey}<div class="turnstile-slot"><Turnstile bind:this={turnstile} siteKey={data.turnstileSiteKey} /></div>{/if}
  </form>
  {#if error || form?.error}<p class="alert alert-fail" role="alert">{error ?? form?.error}</p>{/if}
  <div class="targets"><span>Try:</span>{#each examples as ex}<button type="button" class="chip" onclick={() => { value = ex; input?.focus(); }}>{ex}</button>{/each}</div>
</section>

<section class="specs" aria-label="What the scanner checks">
  <div class="spec">
    <div class="spec-h"><div class="spec-ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></div><h3>Security &amp; headers</h3></div>
    <p>Reads the homepage response for HSTS, Content-Security-Policy, clickjacking and MIME-sniffing defences, cookie flags and script integrity, showing the observed value for each. Email spoofing protection (SPF, DKIM, DMARC) is checked from DNS.</p>
    <div class="tags"><span class="tag">HSTS</span><span class="tag">CSP</span><span class="tag">X-Frame-Options</span><span class="tag">Cookies</span><span class="tag">DMARC</span></div>
  </div>
  <div class="spec">
    <div class="spec-h"><div class="spec-ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg></div><h3>Performance &amp; Core Web Vitals</h3></div>
    <p>Largest Contentful Paint, interaction latency, layout stability and time to first byte from Google PageSpeed Insights, using real Chrome user data where it exists and a throttled mobile lab run otherwise, judged against Google's thresholds.</p>
    <div class="tags"><span class="tag">LCP</span><span class="tag">INP</span><span class="tag">CLS</span><span class="tag">TTFB</span><span class="tag">Lighthouse</span></div>
  </div>
  <div class="spec">
    <div class="spec-h"><div class="spec-ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></svg></div><h3>Infrastructure &amp; stack</h3></div>
    <p>Resolves DNS and the CDN edge, looks up domain registration, walks the TLS certificate chain, and fingerprints the platform, framework, analytics and third-party scripts, with WordPress and Shopify details where visible.</p>
    <div class="tags"><span class="tag">DNS</span><span class="tag">CDN</span><span class="tag">TLS chain</span><span class="tag">CMS</span><span class="tag">Third parties</span></div>
  </div>
</section>

{#if scan}<ScanModal scanId={scan.id} host={scan.host} />{/if}
