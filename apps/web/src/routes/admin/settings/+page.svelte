<script lang="ts">
  let { data, form } = $props();
  const v = data.values as Record<string, unknown>;
</script>

<svelte:head><title>Admin — settings</title></svelte:head>

<div class="page-head">
  <h1>Settings</h1>
  <p class="lead">Changes apply immediately to new requests. Nothing here needs a redeploy.</p>
</div>
{#if form?.saved}<p class="alert" role="status">Saved.</p>{/if}

<form method="POST" action="?/save" class="settings">
  <div class="panel">
    <header><h2>Kill switch</h2></header>
    <table class="kv form-rows"><tbody>
      <tr><td><label for="paused">Pause all scanning</label></td><td><label class="check"><input id="paused" type="checkbox" name="paused" checked={!!v[data.keys.scanningPaused]} /> New requests are refused with a maintenance message and the worker skips queued jobs.</label></td></tr>
    </tbody></table>
  </div>

  <div class="panel">
    <header><h2>Limits</h2><span class="hint">Protects the sites we scan and this server</span></header>
    <table class="kv form-rows"><tbody>
      <tr><td><label for="d">Fresh scans per domain, per hour</label></td><td><input id="d" type="number" name={data.keys.maxScansPerDomainPerHour} value={v[data.keys.maxScansPerDomainPerHour]} min="1" max="60" /><span class="help">Across all visitors. Further requests get the cached result.</span></td></tr>
      <tr><td><label for="i">Scans per visitor, per hour</label></td><td><input id="i" type="number" name={data.keys.maxScansPerIpPerHour} value={v[data.keys.maxScansPerIpPerHour]} min="1" max="500" /><span class="help">Per IP address.</span></td></tr>
      <tr><td><label for="c">Reuse a result for</label></td><td><input id="c" type="number" name={data.keys.cacheWindowMinutes} value={v[data.keys.cacheWindowMinutes]} min="0" max="1440" /><span class="help">Minutes. A repeat lookup inside this window returns the stored report.</span></td></tr>
    </tbody></table>
  </div>

  <div class="panel">
    <header><h2>Optional stages</h2></header>
    <table class="kv form-rows"><tbody>
      <tr><td><label for="browser">Browser rendering</label></td><td><label class="check"><input id="browser" type="checkbox" name="browser" checked={!!v[data.keys.browserEnabled]} /> Screenshots and rendered-page checks with Chromium on this server.</label></td></tr>
      <tr><td><label for="external">External APIs</label></td><td><label class="check"><input id="external" type="checkbox" name="external" checked={!!v[data.keys.externalEnabled]} /> PageSpeed Insights, Safe Browsing, WordPress.org, Wordfence, Wayback and Green Web checks.</label></td></tr>
    </tbody></table>
  </div>

  <div class="form-actions"><button class="primary" type="submit">Save settings</button></div>
</form>

<div class="panel danger-zone">
  <header><h2>Delete data</h2><span class="hint">Cannot be undone</span></header>
  {#if form?.purged}<p class="alert in-panel-alert" role="status" style="margin-top: 16px">Deleted {form.purged.removed.toLocaleString()} {form.purged.what === 'everything' ? 'records' : form.purged.what === 'cache' ? 'cached API responses' : form.purged.what}{form.purged.olderThan !== 'all' ? ` older than ${form.purged.olderThan} days` : ''}.</p>{/if}
  {#if form?.purgeError}<p class="alert red in-panel-alert" role="alert" style="margin-top: 16px">{form.purgeError}</p>{/if}
  <form method="POST" action="?/purge" onsubmit={(e) => { if (!confirm('Delete this data permanently?')) e.preventDefault(); }}>
    <table class="kv form-rows"><tbody>
      <tr><td>What to delete</td><td>
        <div class="choices">
          <label class="check"><input type="radio" name="what" value="lookups" required /> <span><strong>Lookups</strong> <span class="muted">({data.counts.lookups.toLocaleString()})</span> — who searched for what, with IP hashes and browser details. Reports are kept.</span></label>
          <label class="check"><input type="radio" name="what" value="scans" /> <span><strong>Scans and reports</strong> <span class="muted">({data.counts.scans.toLocaleString()})</span> — stored results, screenshots and PDFs. Report links stop working. Lookup rows are kept but lose their link.</span></label>
          <label class="check"><input type="radio" name="what" value="cache" /> <span><strong>API cache</strong> <span class="muted">({data.counts.cache.toLocaleString()})</span> — saved PageSpeed, Safe Browsing and WordPress.org responses. Harmless; they are fetched again when needed.</span></label>
          <label class="check"><input type="radio" name="what" value="everything" /> <span><strong>Everything above</strong> — a clean slate. Settings and the blocklist are kept.</span></label>
        </div>
      </td></tr>
      <tr><td><label for="older">Only older than</label></td><td><select id="older" name="older_than" class="narrow"><option value="all">Any age (delete all)</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></select><span class="help">Age applies to lookups and scans. The API cache is always cleared in full.</span></td></tr>
      <tr><td><label for="confirm">Confirm</label></td><td><input id="confirm" name="confirm" type="text" class="narrow" placeholder="Type DELETE" autocomplete="off" required /><span class="help">Scans that are still running are never deleted.</span></td></tr>
    </tbody></table>
    <div class="in-panel-actions"><button class="secondary danger-btn" type="submit">Delete permanently</button></div>
  </form>
</div>
