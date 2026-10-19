<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head><title>How it works — {data.siteName}</title></svelte:head>

<div class="frame">
  <div class="hero">
    <h1 class="h-display two-tone"><span class="lead">How the scanner</span><span class="tail">works</span></h1>
    <div>
      <p class="sec-desc">If you found <code>SiteScanBot/1.0</code> in your logs, someone entered your website into this tool. Here is exactly what it does, and how to opt out.</p>
    </div>
  </div>
</div>

<section class="band">
  <div class="frame">
    <div class="docgrid">
      <div><div class="lbl-s">01</div><h2>What it loads</h2></div>
      <dl class="dlx">
        <dt>The page</dt><dd>The address a visitor entered (usually your homepage), following redirects like a browser would.</dd>
        <dt>Standard files</dt><dd><code>/robots.txt</code>, <code>/sitemap.xml</code>, <code>/.well-known/security.txt</code>, <code>/ads.txt</code>, <code>/llms.txt</code>, <code>/favicon.ico</code></dd>
        <dt>Scripts</dt><dd>A few of the JavaScript files that page already references, to identify libraries.</dd>
        <dt>WordPress</dt><dd>The theme's <code>style.css</code> header, the <code>readme.txt</code> of plugins the page references, and <code>/wp-json/</code>.</dd>
        <dt>Browser</dt><dd>One rendered visit in a headless browser to take a screenshot.</dd>
      </dl>
    </div>
  </div>
</section>

<section class="band">
  <div class="frame">
    <div class="docgrid">
      <div><div class="lbl-s">02</div><h2>What it never does</h2></div>
      <div>
        <dl class="dlx">
          <dt>No writes</dt><dd>No POST requests, form submissions, logins or password attempts.</dd>
          <dt>No probing</dt><dd>No guessing of hidden files (<code>.env</code>, backups, admin paths) and no vulnerability payloads.</dd>
          <dt>No crawling</dt><dd>One page per scan, at most ~25 requests, then it stops.</dd>
          <dt>No retries</dt><dd>If your site returns 403/429 or a bot challenge, it records "restricted" and backs off for an hour.</dd>
          <dt>Rate-limited</dt><dd>A handful of scans of any domain per hour, however many people ask; results are cached.</dd>
        </dl>
        <p class="note-s">It also checks public DNS, RDAP registration data, Certificate Transparency logs (which is where the subdomain list comes from) and free public APIs (Google PageSpeed Insights, Google Safe Browsing, WordPress.org). None of those touch your server.</p>
      </div>
    </div>
  </div>
</section>

<section class="band" id="opt-out">
  <div class="frame">
    <div class="docgrid">
      <div><div class="lbl-s">03</div><h2>Opt out</h2></div>
      <div>
        {#if form?.done}
          <div class="alert ok" role="status"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="m5.5 8.2 1.8 1.8 3.2-3.8" /></svg><div>Thanks — <b>{form.domain}</b> will no longer be scanned.</div></div>
        {:else}
          <p class="sec-desc" style="max-width: 52ch">Site owners can exclude a domain. Opt-outs take effect immediately and cover all subdomains.</p>
          <form method="POST" class="optout" style="margin-top: 20px">
            <div><label class="lbl" for="domain">Domain</label><input id="domain" name="domain" type="text" class="input" placeholder="example.com" required value={form?.domain ?? ''} /></div>
            <div><label class="lbl" for="contact">Contact email <span class="subtle">(optional)</span></label><input id="contact" name="contact" type="text" class="input" placeholder="you@example.com" /></div>
            <div><button class="btn primary" type="submit">Opt out</button></div>
          </form>
          {#if form?.error}<div class="alert err alertbar" role="alert"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M8 5v3.5M8 10.8v.1" /></svg><div>{form.error}</div></div>{/if}
        {/if}
        {#if data.abuseContact}<p class="note-s">Questions or abuse reports: <a class="a" href="mailto:{data.abuseContact}">{data.abuseContact}</a></p>{/if}
      </div>
    </div>
  </div>
</section>
