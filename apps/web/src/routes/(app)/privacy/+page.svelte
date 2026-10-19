<script lang="ts">
  let { data } = $props();
</script>

<svelte:head><title>Privacy — {data.siteName}</title></svelte:head>

<div class="frame">
  <div class="hero">
    <h1 class="h-display two-tone"><span class="lead">Privacy</span><span class="tail">in plain words</span></h1>
    <div><p class="sec-desc">This is a free tool run by an individual. Here is what is stored, for how long, and what is not collected.</p></div>
  </div>
</div>

<section class="band">
  <div class="frame sec compact">
    <div class="sec-head">
      <div><div class="sec-num">01</div><h2 class="sec-title">What is stored when you run a scan</h2></div>
      <p class="sec-desc">The minimum needed to run the tool and prevent abuse.</p>
    </div>
      <dl class="dlx">
    <dt>Your request</dt><dd>The address you entered and the time.</dd>
    <dt>About you</dt><dd>Your IP address (kept for 30 days for abuse prevention, then replaced by a one-way hash), your country, browser user-agent and the referring page.</dd>
    <dt>The result</dt><dd>The public responses of the website you scanned (page source, headers, DNS records, certificate details) and the report derived from them. Retained indefinitely so results can be revisited. Screenshots and PDFs are deleted after about 90 days.</dd>
    <dt>Who can see it</dt><dd>Results are reachable only through the unguessable link you receive. There is no public directory of scans and report pages are marked <code>noindex</code>. The operator can see all scans.</dd>
      </dl>
  </div>
</section>

<section class="band">
  <div class="frame sec compact">
    <div class="sec-head">
      <div><div class="sec-num">02</div><h2 class="sec-title">What is not collected</h2></div>
      <p class="sec-desc">No advertising, no tracking cookies.</p>
    </div>
      <dl class="dlx">
    <dt>Tracking</dt><dd>No advertising and no tracking cookies. Page views are counted with self-hosted, cookieless Umami analytics; the only cookie is an admin session for the operator.</dd>
    <dt>Cloudflare</dt><dd>Cloudflare sits in front of this site for protection; its <a class="a" href="https://www.cloudflare.com/privacypolicy/" rel="noopener">privacy policy</a> applies to that traffic. If a human check appears, that is Cloudflare Turnstile.</dd>
    <dt>Scanned sites</dt><dd>They receive only ordinary read requests (see <a class="a" href="/bot">how it works</a>). Set-Cookie values from scanned sites are redacted before storage.</dd>
      </dl>
  </div>
</section>

<section class="band">
  <div class="frame sec compact">
    <div class="sec-head">
      <div><div class="sec-num">03</div><h2 class="sec-title">Your rights</h2></div>
      <p class="sec-desc">Ask for your data to be deleted, or opt a domain out.</p>
    </div>
      <p class="sec-desc" style="max-width: 56ch">You can ask for lookup records associated with your IP, or a report, to be deleted{#if data.abuseContact}&nbsp;by emailing <a class="a" href="mailto:{data.abuseContact}">{data.abuseContact}</a>{/if}. Website owners can opt their domain out on the <a class="a" href="/bot#opt-out">how it works page</a>.</p>
  </div>
</section>
