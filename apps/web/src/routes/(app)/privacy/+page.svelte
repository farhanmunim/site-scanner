<script lang="ts">
  let { data } = $props();
</script>

<svelte:head><title>Privacy — {data.siteName}</title></svelte:head>

<div class="ss-wrap">
  <article class="ss-prose">
    <span class="eui-eyebrow">Privacy</span>
    <h1>Privacy in plain words</h1>
    <p>This is a free tool run by an individual. Here is what is stored, for how long, and what is not collected.</p>

    <h2>What is stored when you run a scan</h2>
    <dl class="ss-kv">
      <dt>Your request</dt><dd>The address you entered and the time.</dd>
      <dt>About you</dt><dd>Your IP address (kept for 30 days for abuse prevention, then replaced by a one-way hash), your country, browser user-agent and the referring page.</dd>
      <dt>The result</dt><dd>The public responses of the website you scanned (page source, headers, DNS records, certificate details) and the report derived from them. Retained indefinitely so results can be revisited. Screenshots and PDFs are deleted after about 90 days.</dd>
      <dt>Who can see it</dt><dd>Results are reachable only through the unguessable link you receive. There is no public directory of scans and report pages are marked <code>noindex</code>. The operator can see all scans.</dd>
    </dl>

    <h2>What is not collected</h2>
    <dl class="ss-kv">
      <dt>Tracking</dt><dd>No advertising and no tracking cookies. Page views are counted with self-hosted, cookieless Umami analytics; the only cookie is an admin session for the operator.</dd>
      <dt>Cloudflare</dt><dd>Cloudflare sits in front of this site for protection; its <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">privacy policy</a> applies to that traffic. If a human check appears, that is Cloudflare Turnstile.</dd>
      <dt>Scanned sites</dt><dd>They receive only ordinary read requests (see <a href="/bot">how it works</a>). Set-Cookie values from scanned sites are redacted before storage.</dd>
    </dl>

    <h2>Your rights</h2>
    <p>You can ask for lookup records associated with your IP, or a report, to be deleted{#if data.abuseContact}&nbsp;by emailing <a href="mailto:{data.abuseContact}">{data.abuseContact}</a>{/if}. Website owners can opt their domain out by email; see <a href="/bot#opt-out">how it works</a>.</p>
  </article>
</div>
