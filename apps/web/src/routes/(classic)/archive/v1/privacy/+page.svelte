<script lang="ts">
  let { data } = $props();
</script>

<svelte:head><title>Privacy — {data.siteName}</title></svelte:head>

<div class="prose">
  <h1>Privacy</h1>
  <p class="lead">This is a free tool run by an individual. Here is what is stored, for how long, and what is not collected.</p>

  <div class="card">
    <div class="card-h"><div class="card-title">What is stored when you run a scan</div></div>
    <table class="table kv"><tbody>
      <tr><td>Your request</td><td>The address you entered and the time.</td></tr>
      <tr><td>About you</td><td>Your IP address (kept for 30 days for abuse prevention, then replaced by a one-way hash), your country, browser user-agent and the referring page.</td></tr>
      <tr><td>The result</td><td>The public responses of the website you scanned (page source, headers, DNS records, certificate details) and the report derived from them. Retained indefinitely so results can be revisited. Screenshots and PDFs are deleted after about 90 days.</td></tr>
      <tr><td>Who can see it</td><td>Results are reachable only through the unguessable link you receive. There is no public directory of scans and report pages are marked <code>noindex</code>. The operator can see all scans.</td></tr>
    </tbody></table>
  </div>

  <div class="card">
    <div class="card-h"><div class="card-title">What is not collected</div></div>
    <table class="table kv"><tbody>
      <tr><td>Tracking</td><td>No advertising and no tracking cookies. Page views are counted with self-hosted, cookieless Umami analytics; the only cookie is an admin session for the operator.</td></tr>
      <tr><td>Cloudflare</td><td>Cloudflare sits in front of this site for protection; its <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">privacy policy</a> applies to that traffic. If a human check appears, that is Cloudflare Turnstile.</td></tr>
      <tr><td>Scanned sites</td><td>They receive only ordinary read requests (see <a href="/archive/v1/bot">how it works</a>). Set-Cookie values from scanned sites are redacted before storage.</td></tr>
    </tbody></table>
  </div>

  <div class="card">
    <div class="card-h"><div class="card-title">Your rights</div></div>
    <p class="note" style="border-top: 0">You can ask for lookup records associated with your IP, or a report, to be deleted{#if data.abuseContact}&nbsp;by emailing <a href="mailto:{data.abuseContact}">{data.abuseContact}</a>{/if}. Website owners can opt their domain out by email; see <a href="/archive/v1/bot#opt-out">how it works</a>.</p>
  </div>
</div>
