<script lang="ts">
  let { data } = $props();
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
  <div class="frame sec compact">
    <div class="sec-head">
      <div><div class="sec-num">01</div><h2 class="sec-title">What it loads</h2></div>
      <p class="sec-desc">Only ordinary read requests, for one page and a few standard files.</p>
    </div>
      <dl class="dlx">
    <dt>The page</dt><dd>The address a visitor entered (usually your homepage), following redirects like a browser would.</dd>
    <dt>Standard files</dt><dd><code>/robots.txt</code>, <code>/sitemap.xml</code>, <code>/.well-known/security.txt</code>, <code>/ads.txt</code>, <code>/llms.txt</code>, <code>/favicon.ico</code></dd>
    <dt>Scripts</dt><dd>A few of the JavaScript files that page already references, to identify libraries.</dd>
    <dt>WordPress</dt><dd>The theme's <code>style.css</code> header, the <code>readme.txt</code> of plugins the page references, and <code>/wp-json/</code>.</dd>
    <dt>Browser</dt><dd>One rendered visit in a headless browser to take a screenshot.</dd>
      </dl>
  </div>
</section>

<section class="band">
  <div class="frame sec compact">
    <div class="sec-head">
      <div><div class="sec-num">02</div><h2 class="sec-title">What it never does</h2></div>
      <p class="sec-desc">Passive by design. It never logs in, guesses hidden paths or sends attack payloads.</p>
    </div>
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
</section>

<section class="band" id="opt-out">
  <div class="frame sec compact">
    <div class="sec-head">
      <div><div class="sec-num">03</div><h2 class="sec-title">Opt out</h2></div>
      <p class="sec-desc">Site owners can exclude a domain at any time, by email.</p>
    </div>
    <p class="sec-desc" style="max-width: 56ch">
      {#if data.abuseContact}Email <a class="a" href="mailto:{data.abuseContact}?subject=Opt%20out%20of%20scanning">{data.abuseContact}</a> with the domain you want excluded.{:else}Email the operator (contact details at <a class="a" href="https://farhan.app/" rel="noopener">farhan.app</a>) with the domain you want excluded.{/if}
      An opt-out covers the domain and all of its subdomains, and no further scans of it are accepted once it is processed.
    </p>
  </div>
</section>
