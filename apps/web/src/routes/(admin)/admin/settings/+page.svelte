<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  let { data, form } = $props();
  const v = data.values as Record<string, unknown>;
</script>

<svelte:head><title>Admin: settings</title></svelte:head>

<div class="ad-head"><div><span class="eui-eyebrow">Admin</span><h1>Settings</h1><p>Changes apply immediately to new requests. Nothing here needs a redeploy.</p></div></div>
{#if form?.saved}<div class="ss-alert ok ad-alert" role="status"><Icon name="check" /><div>Saved.</div></div>{/if}

<div class="ad-stack">
  <form method="POST" action="?/save" class="ad-stack">
    <section class="ad-card">
      <header><h2>Kill switch</h2></header>
      <div class="ad-row"><span class="lbl">Pause all scanning</span><div><label class="ad-switch"><input id="paused" type="checkbox" role="switch" name="paused" checked={!!v[data.keys.scanningPaused]} /><span class="tr"></span><span class="tx">New requests are refused with a maintenance message and the worker skips queued jobs.</span></label></div></div>
    </section>

    <section class="ad-card">
      <header><div><h2>Limits</h2><p>Protects the sites we scan and this server</p></div></header>
      <div class="ad-row"><label for="d">Fresh scans per domain, per hour</label><div><input id="d" type="number" class="eui-input" name={data.keys.maxScansPerDomainPerHour} value={v[data.keys.maxScansPerDomainPerHour]} min="1" max="60" /><span class="help">Across all visitors. Further requests get the cached result.</span></div></div>
      <div class="ad-row"><label for="i">Scans per visitor, per hour</label><div><input id="i" type="number" class="eui-input" name={data.keys.maxScansPerIpPerHour} value={v[data.keys.maxScansPerIpPerHour]} min="1" max="500" /><span class="help">Per IP address.</span></div></div>
      <div class="ad-row"><label for="c">Reuse a result for (minutes)</label><div><input id="c" type="number" class="eui-input" name={data.keys.cacheWindowMinutes} value={v[data.keys.cacheWindowMinutes]} min="0" max="1440" /><span class="help">A repeat lookup inside this window returns the stored report.</span></div></div>
    </section>

    <section class="ad-card">
      <header><h2>Optional stages</h2></header>
      <div class="ad-row"><span class="lbl">Browser rendering</span><div><label class="ad-switch"><input id="browser" type="checkbox" role="switch" name="browser" checked={!!v[data.keys.browserEnabled]} /><span class="tr"></span><span class="tx">Screenshots and rendered-page checks with Chromium on this server.</span></label></div></div>
      <div class="ad-row"><span class="lbl">External APIs</span><div><label class="ad-switch"><input id="external" type="checkbox" role="switch" name="external" checked={!!v[data.keys.externalEnabled]} /><span class="tr"></span><span class="tx">PageSpeed Insights, Safe Browsing, WordPress.org, Wordfence, Wayback, Green Web, retire.js and blocklist checks.</span></label></div></div>
    </section>

    <div class="ad-actions"><button class="eui-btn" type="submit">Save settings</button></div>
  </form>

  <section class="ad-card danger">
    <header><div><h2>Delete data</h2><p>Cannot be undone</p></div></header>
    {#if form?.purged}<div class="ss-alert ok ad-alert" role="status"><Icon name="check" /><div>Deleted {form.purged.removed.toLocaleString()} {form.purged.what === 'everything' ? 'records' : form.purged.what === 'cache' ? 'cached API responses' : form.purged.what}{form.purged.olderThan !== 'all' ? ` older than ${form.purged.olderThan} days` : ''}.{#if form.purged.filesFailed}&nbsp;{form.purged.filesFailed} screenshot or PDF file{form.purged.filesFailed === 1 ? '' : 's'} could not be removed from disk (see the web service log); the worker's retention sweep will clear {form.purged.filesFailed === 1 ? 'it' : 'them'} later.{/if}</div></div>{/if}
    {#if form?.purgeError}<div class="ss-alert err ad-alert" role="alert"><Icon name="alert" /><div>{form.purgeError}</div></div>{/if}
    <form method="POST" action="?/purge" onsubmit={(e) => { if (!confirm('Delete this data permanently?')) e.preventDefault(); }}>
      <div class="ad-row"><span class="lbl">What to delete</span>
        <div class="ad-choices">
          <label class="ad-choice"><input type="radio" name="what" value="lookups" required /><span><strong>Lookups</strong> <span class="d">({data.counts.lookups.toLocaleString()}): who searched for what, with IP hashes and browser details. Reports are kept.</span></span></label>
          <label class="ad-choice"><input type="radio" name="what" value="scans" /><span><strong>Scans and reports</strong> <span class="d">({data.counts.scans.toLocaleString()}): stored results, screenshots, PDFs and the domains list. Report links stop working. Lookup rows are kept but lose their link.</span></span></label>
          <label class="ad-choice"><input type="radio" name="what" value="cache" /><span><strong>API cache</strong> <span class="d">({data.counts.cache.toLocaleString()}): saved PageSpeed, Safe Browsing and WordPress.org responses. Harmless; they are fetched again when needed.</span></span></label>
          <label class="ad-choice"><input type="radio" name="what" value="everything" /><span><strong>Everything above</strong> <span class="d">a clean slate. Settings and the blocklist are kept.</span></span></label>
        </div>
      </div>
      <div class="ad-row"><label for="older">Only older than</label><div><select id="older" name="older_than" class="eui-input"><option value="all">Any age (delete all)</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></select><span class="help">Age applies to lookups and scans. The API cache is always cleared in full.</span></div></div>
      <div class="ad-row"><label for="confirm">Confirm</label><div><input id="confirm" name="confirm" type="text" class="eui-input" placeholder="Type DELETE" autocomplete="off" required /><span class="help">Scans that are still running are never deleted.</span></div></div>
      <div class="ad-actions pad"><button class="eui-btn outline danger" type="submit"><Icon name="trash" size={14} />Delete permanently</button></div>
    </form>
  </section>
</div>
