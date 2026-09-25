<script lang="ts">
  let { data, form } = $props();
  const v = data.values as Record<string, unknown>;
</script>

<svelte:head><title>Admin — settings</title></svelte:head>
<h1>Settings</h1>
{#if form?.saved}<p class="alert" role="status">Saved.</p>{/if}
<form method="POST" class="card" style="max-width: 560px">
  <h2>Kill switch</h2>
  <label><input type="checkbox" name="paused" checked={!!v[data.keys.scanningPaused]} /> <strong>Pause all scanning</strong> — new requests are refused with a maintenance message; the worker skips queued jobs.</label>
  <h2 style="margin-top: 18px">Limits</h2>
  <label for="d">Fresh scans per domain per hour (all users)</label>
  <input id="d" type="number" name={data.keys.maxScansPerDomainPerHour} value={v[data.keys.maxScansPerDomainPerHour]} min="1" max="60" />
  <label for="i" style="margin-top: 8px; display: block">Scans per visitor IP per hour</label>
  <input id="i" type="number" name={data.keys.maxScansPerIpPerHour} value={v[data.keys.maxScansPerIpPerHour]} min="1" max="500" />
  <label for="c" style="margin-top: 8px; display: block">Serve cached result if newer than (minutes)</label>
  <input id="c" type="number" name={data.keys.cacheWindowMinutes} value={v[data.keys.cacheWindowMinutes]} min="0" max="1440" />
  <h2 style="margin-top: 18px">Stages</h2>
  <label><input type="checkbox" name="browser" checked={!!v[data.keys.browserEnabled]} /> Browser rendering + screenshots (Chromium on this VPS)</label><br />
  <label><input type="checkbox" name="external" checked={!!v[data.keys.externalEnabled]} /> External enrichment APIs (PageSpeed Insights, Safe Browsing, WordPress.org, Wordfence, Wayback, Green Web)</label>
  <div style="margin-top: 16px"><button class="primary" type="submit">Save</button></div>
</form>
