<script lang="ts">
  let { data } = $props();
</script>

<svelte:head><title>Privacy — {data.siteName}</title></svelte:head>

<h1>Privacy</h1>
<div class="card">
  <h2>What we store when you run a scan</h2>
  <p>This is a free tool run by an individual. To keep it working and to understand how it is used, every scan request is logged and kept by the operator. That includes:</p>
  <ul>
    <li>The address you entered and the time.</li>
    <li>Your IP address (kept for 30 days for abuse prevention, then replaced by a one-way hash), your country, browser user-agent and the referring page.</li>
    <li>The scan result: the public responses of the website you scanned (page source, headers, DNS records, certificate details) and the report derived from them. These are retained indefinitely so results can be revisited and compared over time. Screenshots are deleted after about 90 days.</li>
  </ul>
  <p>Results are reachable only through the unguessable link you receive. There is no public directory of scans and report pages are marked <code>noindex</code>. The operator can see all scans.</p>
  <h2>What we do not do</h2>
  <ul>
    <li>No advertising and no tracking cookies. Page views are counted with self-hosted, cookieless Umami analytics run by the operator; the only cookie is an admin session for the operator.</li>
    <li>Cloudflare sits in front of this site for protection; its <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">privacy policy</a> applies to that traffic. If a human check appears, that is Cloudflare Turnstile.</li>
    <li>Scanned websites receive only ordinary read requests; see <a href="/bot">about the scanner</a>. Set-Cookie values from scanned sites are redacted before storage.</li>
  </ul>
  <h2>Your rights</h2>
  <p>You can ask for lookup records associated with your IP or a report to be deleted{#if data.abuseContact} by emailing <a href="mailto:{data.abuseContact}">{data.abuseContact}</a>{/if}. Website owners can opt their domain out on the <a href="/bot#opt-out">bot page</a>.</p>
</div>
