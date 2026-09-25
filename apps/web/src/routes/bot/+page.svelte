<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head><title>About SiteScannerBot — {data.siteName}</title></svelte:head>

<h1>About SiteScannerBot</h1>
<p class="muted">If you found <code>SiteScannerBot/1.0</code> in your logs, someone entered your website into this tool. Here is exactly what it does — and how to opt out.</p>

<div class="card">
  <h2>What it fetches</h2>
  <ul>
    <li>The page a visitor entered (usually your homepage), following redirects like a browser would.</li>
    <li><code>/robots.txt</code>, <code>/sitemap.xml</code>, <code>/.well-known/security.txt</code>, <code>/ads.txt</code>, <code>/llms.txt</code>, <code>/favicon.ico</code>.</li>
    <li>A few of the JavaScript files that page already references, to identify libraries.</li>
    <li>On WordPress sites: the theme's <code>style.css</code> header and <code>readme.txt</code> of plugins the page references, plus <code>/wp-json/</code>.</li>
    <li>Optionally, one rendered visit in a headless browser to take a screenshot.</li>
  </ul>
  <h2>What it never does</h2>
  <ul>
    <li>No POST requests, form submissions, logins, or password attempts.</li>
    <li>No guessing of hidden files (<code>.env</code>, backups, admin paths) and no vulnerability payloads.</li>
    <li>No crawling: one page per scan, at most ~25 requests, then it stops.</li>
    <li>No retries when your site returns 403/429 or a bot challenge — it records "restricted" and backs off for an hour.</li>
    <li>No more than a handful of scans of any domain per hour, however many people ask; results are cached.</li>
  </ul>
  <p class="small muted">It also checks public DNS, RDAP registration data, Certificate Transparency logs and free public APIs (Google PageSpeed Insights, Google Safe Browsing, WordPress.org). None of those touch your server.</p>
</div>

<div class="card" id="opt-out">
  <h2>Opt out</h2>
  <p>Site owners can exclude a domain. Enter the domain and an email we can reply to; opt-outs take effect immediately and cover all subdomains.</p>
  {#if form?.done}
    <p class="alert" role="status">Thanks — <strong>{form.domain}</strong> will no longer be scanned.</p>
  {:else}
    <form method="POST" class="row">
      <input name="domain" type="text" placeholder="example.com" required style="max-width: 280px" value={form?.domain ?? ''} />
      <input name="contact" type="text" placeholder="you@example.com (optional)" style="max-width: 280px" />
      <button class="primary" type="submit">Opt out</button>
    </form>
    {#if form?.error}<p class="alert bad" role="alert">{form.error}</p>{/if}
  {/if}
  {#if data.abuseContact}<p class="small muted" style="margin-top: 10px">Questions or abuse reports: <a href="mailto:{data.abuseContact}">{data.abuseContact}</a>.</p>{/if}
</div>
