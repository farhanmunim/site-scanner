<script lang="ts">
  import { goto } from '$app/navigation';
  import Turnstile from '$lib/components/Turnstile.svelte';
  import ScanModal from '$lib/components/ScanModal.svelte';
  import { fmtDate } from '$lib/format';
  let { form, data } = $props();
  let value = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let scan = $state<{ id: string; host: string } | null>(null);
  let turnstile: Turnstile | undefined = $state();
  let input: HTMLInputElement | undefined = $state();
  $effect(() => {
    value = form?.input ?? data.prefill ?? '';
  });
  const clean = (v: string) => v.trim().replace(/^https?:\/\//i, '');

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const url = clean(value);
    if (!url) {
      error = 'Enter a website address.';
      input?.focus();
      return;
    }
    busy = true;
    error = null;
    try {
      const r = await fetch('/api/scans', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'x-scan-source': 'web' }, body: JSON.stringify({ url, turnstileToken: turnstile?.token() ?? undefined }) });
      const j = (await r.json()) as { scanId?: string; cached?: boolean; notice?: string | null; error?: string };
      if (!r.ok || !j.scanId) {
        error = j.error ?? 'Something went wrong. Please try again.';
        turnstile?.reset();
        return;
      }
      if (j.cached) {
        await goto(`/r/${j.scanId}${j.notice ? `?notice=${encodeURIComponent(j.notice)}` : ''}`);
        return;
      }
      scan = { id: j.scanId, host: url.replace(/[/?#].*$/, '') };
    } catch {
      error = 'Could not reach the scanner. Check your connection and try again.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>{data.siteName} — How is this website built?</title>
  <meta name="description" content="A plain-English report on how any website is built, hosted and secured. Free, no account needed." />
</svelte:head>

<section class="hero">
  <h1>How is this website built?</h1>
  <p>A plain-English report on how any website is built, hosted and secured.</p>
  <form method="POST" onsubmit={submit} novalidate>
    <div class="scanner">
      <div class="row">
        <div class="prefix" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg><span>https://</span></div>
        <label class="sr-only" for="url">Website address</label>
        <input id="url" name="url" class="urlfield" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Enter any domain…" bind:value bind:this={input} required autofocus />
        <span class="kbd" aria-hidden="true">↵ Enter</span>
      </div>
      <button type="submit" class="btn btn-primary btn-scan" disabled={busy}>{busy ? 'Starting…' : 'Start scan'}{#if !busy}<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>{/if}</button>
    </div>
    {#if data.turnstileSiteKey}<div class="turnstile-slot"><Turnstile bind:this={turnstile} siteKey={data.turnstileSiteKey} /></div>{/if}
  </form>
  {#if error || form?.error}<p class="alert alert-fail" role="alert">{error ?? form?.error}</p>{/if}
  <div class="targets"><span>Try:</span>{#each data.examples as ex}<button type="button" class="chip" onclick={() => { value = ex; input?.focus(); }}>{ex}</button>{/each}</div>
  <p class="fine">Free, no account. Read-only: about 25 requests, nothing is probed or changed.</p>
</section>

{#if data.sample}
  {@const s = data.sample}
  <section class="sample" aria-label="Example report">
    <div class="lab"><span>What a report looks like</span><span>{s.host} · scanned {fmtDate(s.scannedAt)}</span></div>
    <a class="sample-card" href="/r/{s.id}">
      <div class="sample-top">
        <div class="grade">{s.grade}<small>{s.overall} / 100</small></div>
        <div style="min-width: 0"><div class="host">{s.host}</div><p class="verdict">{s.summary}</p></div>
      </div>
      {#if s.fixes.length}
        <ul class="sample-fixes">
          {#each s.fixes as f (f.title)}<li><span>{f.title}</span><span>{f.where}</span></li>{/each}
        </ul>
      {/if}
      {#if s.stack.length}<div class="tags">{#each s.stack as t (t)}<span class="tag">{t}</span>{/each}</div>{/if}
    </a>
  </section>
{:else}
  <ul class="what" aria-label="What the report covers">
    <li>Technology stack, platform and hosting, with a screenshot.</li>
    <li>Security headers, certificate chain and email spoofing protection.</li>
    <li>Core Web Vitals from real Chrome users, and who the site shares data with.</li>
  </ul>
{/if}

{#if scan}<ScanModal scanId={scan.id} host={scan.host} />{/if}
