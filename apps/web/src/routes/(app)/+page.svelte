<script lang="ts">
  import { goto } from '$app/navigation';
  import Turnstile from '$lib/components/Turnstile.svelte';
  import ScanModal from '$lib/v2/ScanModal.svelte';
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

<div class="frame">
  <div class="home-hero">
    <div>
      <h1 class="h-display two-tone"><span class="lead">How is this website</span><span class="tail">built?</span></h1>
      <form class="scanform" method="POST" onsubmit={submit} novalidate>
        <div class="scanbox">
          <span class="pre" aria-hidden="true">https://</span>
          <label class="sr-only" for="url" style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%)">Website address</label>
          <input id="url" name="url" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="example.com" bind:value bind:this={input} required />
          <button type="submit" class="btn primary" disabled={busy}>
            {#if busy}<span class="spinner" style="border-color: rgb(var(--text-white) / 0.35); border-top-color: rgb(var(--text-white))"></span>{/if}
            {checking ? 'Checking…' : busy ? 'Starting…' : 'Scan'}<span class="lbl-long">{busy ? '' : ' website'}</span>
          </button>
        </div>
        {#if data.turnstileSiteKey}<div class="turnstile-slot"><Turnstile bind:this={turnstile} siteKey={data.turnstileSiteKey} /></div>{/if}
        {#if error || form?.error}<div class="alert err alertbar" role="alert"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M8 5v3.5M8 10.8v.1" /></svg><div>{error ?? form?.error}</div></div>{/if}
        <div class="try"><span>Try</span>{#each examples as ex}<button type="button" class="fchip" onclick={() => { value = ex; input?.focus(); }}>{ex}</button>{/each}</div>
      </form>
    </div>
    <div>
      <p class="sec-desc">Technology stack, hosting, security headers, certificate chain, Core Web Vitals, email protection, subdomains and who it shares data with, in plain language.</p>
      <p class="spec" style="margin-top: 12px">Free · no account · reads public responses only</p>
    </div>
  </div>
</div>

<section class="band">
  <div class="frame">
    <div class="sec" style="padding-block: 40px 72px">
      <div class="panel showcase" aria-label="Example report, illustrative">
        <div class="glass">
          <div class="sample-top">
            <div>
              <div class="cap" style="margin: 0">example.com</div>
              <div class="sample-grade">86<span style="font-size: 18px; letter-spacing: 0; opacity: 0.5"> / 100</span></div>
            </div>
            <span class="chip green">Grade B</span>
          </div>
          <div class="sample-bars">
            <div class="b"><span>Security headers</span><div class="progress-line"><i style="width: 72%"></i></div><span>72</span></div>
            <div class="b"><span>HTTPS</span><div class="progress-line"><i style="width: 98%"></i></div><span>98</span></div>
            <div class="b"><span>Performance</span><div class="progress-line"><i style="width: 88%"></i></div><span>88</span></div>
            <div class="b w"><span>Email protection</span><div class="progress-line"><i style="width: 55%"></i></div><span>55</span></div>
          </div>
          <div class="chips"><span class="chip">Next.js</span><span class="chip">Cloudflare</span><span class="chip">Vercel</span><span class="chip">Google Analytics</span></div>
          <div class="spec" style="margin: 0">Illustration of a report; not a real scan</div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="band" id="checks">
  <div class="frame sec">
    <div class="sec-head">
      <div><div class="sec-num">01</div><h2 class="sec-title">What the scanner checks</h2></div>
      <p class="sec-desc">One page, read like a browser would. Every finding shows the value that was actually observed, and sections it could not assess are marked rather than scored.</p>
    </div>
    <div class="cols3">
      <div>
        <span class="ti" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="10" height="6.5" rx="1.5" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></svg></span>
        <h3>Security &amp; headers</h3>
        <p>HSTS, Content-Security-Policy, clickjacking and MIME-sniffing defences, cookie flags and script integrity, plus email spoofing protection (SPF, DKIM, DMARC) from DNS.</p>
        <div class="chips"><span class="tag">HSTS</span><span class="tag">CSP</span><span class="tag">Cookies</span><span class="tag">DMARC</span></div>
      </div>
      <div>
        <span class="ti" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M8.8 1.5 3 9h4.5L7.2 14.5 13 7H8.5l.3-5.5Z" /></svg></span>
        <h3>Performance &amp; Core Web Vitals</h3>
        <p>Largest Contentful Paint, interaction latency, layout stability and time to first byte from Google PageSpeed Insights, with real Chrome user data where it exists.</p>
        <div class="chips"><span class="tag">LCP</span><span class="tag">INP</span><span class="tag">CLS</span><span class="tag">TTFB</span></div>
      </div>
      <div>
        <span class="ti" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c1.8 1.7 2.7 3.7 2.7 6S9.8 12.3 8 14C6.2 12.3 5.3 10.3 5.3 8S6.2 3.7 8 2Z" /></svg></span>
        <h3>Infrastructure &amp; stack</h3>
        <p>DNS and the CDN edge, domain registration, the TLS certificate chain, every platform, framework and third-party script, and subdomains from Certificate Transparency logs.</p>
        <div class="chips"><span class="tag">DNS</span><span class="tag">TLS chain</span><span class="tag">CMS</span><span class="tag">Subdomains</span></div>
      </div>
    </div>
  </div>
</section>

<section class="band" id="how">
  <div class="frame sec">
    <div class="sec-head">
      <div><div class="sec-num">02</div><h2 class="sec-title">How it works</h2></div>
      <p class="sec-desc">Passive by design. It never logs in, guesses hidden paths or sends attack payloads.</p>
    </div>
    <ol class="steps">
      <li><div><h4>Enter an address</h4><p>Any public website. Private and internal addresses are refused.</p></div></li>
      <li><div><h4>We read the public response</h4><p>The page, standard files like robots.txt, public DNS, registration data and certificate logs, at most about 25 requests.</p></div></li>
      <li><div><h4>You get a report you can share</h4><p>A scored summary, what to fix first, and every detail behind it. Export it as a PDF or send the link.</p></div></li>
    </ol>
  </div>
</section>

<section class="band" id="faq">
  <div class="frame sec">
    <div class="faq-grid">
      <div>
        <div class="sec-num">03</div>
        <h2 class="sec-title" style="margin-top: 12px">Questions</h2>
        <p class="sec-desc" style="margin-top: 12px">More detail on <a class="a ink" href="/bot">how the scanner behaves</a> and <a class="a ink" href="/privacy">what is stored</a>.</p>
      </div>
      <div class="acc">
        <details><summary>Does it touch my server?</summary><div class="ans">Only with ordinary read requests for your homepage and a few standard files. Everything else (DNS, certificates, registration, performance) comes from public sources.</div></details>
        <details><summary>Where do the subdomains come from?</summary><div class="ans">From public Certificate Transparency logs: every hostname that has ever had a TLS certificate issued. Nothing is probed, so some names may no longer exist.</div></details>
        <details><summary>Is it free? Do I need an account?</summary><div class="ans">Free, no account. A Cloudflare human check may appear to keep automated abuse out.</div></details>
        <details><summary>Who can see my report?</summary><div class="ans">Anyone with the link. Reports are unguessable, unlisted and marked noindex.</div></details>
      </div>
    </div>
  </div>
</section>

{#if scan}<ScanModal scanId={scan.id} host={scan.host} />{/if}
