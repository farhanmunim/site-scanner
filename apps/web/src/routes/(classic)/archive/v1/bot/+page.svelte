<script lang="ts">
  let { data } = $props();
</script>

<svelte:head><title>How it works — {data.siteName}</title></svelte:head>

<div class="prose">
  <h1>How the scanner works</h1>
  <p class="lead">If you found <code>SiteScanBot/1.0</code> in your logs, someone entered your website into this tool. Here is exactly what it does, and how to opt out.</p>

  <div class="card">
    <div class="card-h"><div class="card-title">What it loads</div></div>
    <table class="table kv"><tbody>
      <tr><td>The page</td><td>The address a visitor entered (usually your homepage), following redirects like a browser would.</td></tr>
      <tr><td>Standard files</td><td><code>/robots.txt</code>, <code>/sitemap.xml</code>, <code>/.well-known/security.txt</code>, <code>/ads.txt</code>, <code>/llms.txt</code>, <code>/favicon.ico</code></td></tr>
      <tr><td>Scripts</td><td>A few of the JavaScript files that page already references, to identify libraries.</td></tr>
      <tr><td>WordPress</td><td>The theme's <code>style.css</code> header, the <code>readme.txt</code> of plugins the page references, and <code>/wp-json/</code>.</td></tr>
      <tr><td>Browser</td><td>One rendered visit in a headless browser to take a screenshot.</td></tr>
    </tbody></table>
  </div>

  <div class="card">
    <div class="card-h"><div class="card-title">What it never does</div></div>
    <table class="table kv"><tbody>
      <tr><td>No writes</td><td>No POST requests, form submissions, logins or password attempts.</td></tr>
      <tr><td>No probing</td><td>No guessing of hidden files (<code>.env</code>, backups, admin paths) and no vulnerability payloads.</td></tr>
      <tr><td>No crawling</td><td>One page per scan, at most ~25 requests, then it stops.</td></tr>
      <tr><td>No retries</td><td>If your site returns 403/429 or a bot challenge, it records "restricted" and backs off for an hour.</td></tr>
      <tr><td>Rate-limited</td><td>A handful of scans of any domain per hour, however many people ask; results are cached.</td></tr>
    </tbody></table>
    <p class="note">It also checks public DNS, RDAP registration data, Certificate Transparency logs and free public APIs (Google PageSpeed Insights, Google Safe Browsing, WordPress.org). None of those touch your server.</p>
  </div>

  <div class="card" id="opt-out">
    <div class="card-h"><div class="card-title">Opt out</div></div>
    <div class="card-body">
      <p class="text-2">Site owners can exclude a domain by email{#if data.abuseContact}: <a href="mailto:{data.abuseContact}">{data.abuseContact}</a>{/if}. The opt-out covers all subdomains.</p>
    </div>
  </div>
</div>
