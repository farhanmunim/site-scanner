<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head><title>How it works — {data.siteName}</title></svelte:head>

<div class="prose">
  <h1>How the scanner works</h1>
  <p class="lead">If you found <code>SiteScannerBot/1.0</code> in your logs, someone entered your website into this tool. Here is exactly what it does, and how to opt out.</p>

  <div class="panel">
    <header><h2>What it loads</h2></header>
    <table class="kv"><tbody>
      <tr><td>The page</td><td>The address a visitor entered (usually your homepage), following redirects like a browser would.</td></tr>
      <tr><td>Standard files</td><td><code>/robots.txt</code>, <code>/sitemap.xml</code>, <code>/.well-known/security.txt</code>, <code>/ads.txt</code>, <code>/llms.txt</code>, <code>/favicon.ico</code></td></tr>
      <tr><td>Scripts</td><td>A few of the JavaScript files that page already references, to identify libraries.</td></tr>
      <tr><td>WordPress</td><td>The theme's <code>style.css</code> header, the <code>readme.txt</code> of plugins the page references, and <code>/wp-json/</code>.</td></tr>
      <tr><td>Browser</td><td>One rendered visit in a headless browser to take a screenshot.</td></tr>
    </tbody></table>
  </div>

  <div class="panel">
    <header><h2>What it never does</h2></header>
    <table class="kv"><tbody>
      <tr><td>No writes</td><td>No POST requests, form submissions, logins or password attempts.</td></tr>
      <tr><td>No probing</td><td>No guessing of hidden files (<code>.env</code>, backups, admin paths) and no vulnerability payloads.</td></tr>
      <tr><td>No crawling</td><td>One page per scan, at most ~25 requests, then it stops.</td></tr>
      <tr><td>No retries</td><td>If your site returns 403/429 or a bot challenge, it records "restricted" and backs off for an hour.</td></tr>
      <tr><td>Rate-limited</td><td>A handful of scans of any domain per hour, however many people ask; results are cached.</td></tr>
    </tbody></table>
    <p class="note">It also checks public DNS, RDAP registration data, Certificate Transparency logs and free public APIs (Google PageSpeed Insights, Google Safe Browsing, WordPress.org). None of those touch your server.</p>
  </div>

  <div class="panel" id="opt-out">
    <header><h2>Opt out</h2></header>
    <div class="body">
      {#if form?.done}
        <p class="alert" role="status" style="margin: 0">Thanks — <strong>{form.domain}</strong> will no longer be scanned.</p>
      {:else}
        <p class="text-2">Site owners can exclude a domain. Opt-outs take effect immediately and cover all subdomains.</p>
        <form method="POST" class="scan-form">
          <label class="sr-only" for="domain">Domain</label>
          <input id="domain" name="domain" type="text" placeholder="example.com" required value={form?.domain ?? ''} />
          <label class="sr-only" for="contact">Contact email (optional)</label>
          <input id="contact" name="contact" type="text" placeholder="you@example.com (optional)" />
          <button class="primary" type="submit">Opt out</button>
        </form>
        {#if form?.error}<p class="alert red" role="alert">{form.error}</p>{/if}
      {/if}
      {#if data.abuseContact}<p class="muted small" style="margin: 12px 0 0">Questions or abuse reports: <a href="mailto:{data.abuseContact}">{data.abuseContact}</a></p>{/if}
    </div>
  </div>
</div>
