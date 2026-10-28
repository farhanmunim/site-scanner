<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Turnstile from '$lib/components/Turnstile.svelte';
  import ScanModal from './ScanModal.svelte';
  import Icon from './Icon.svelte';

  let { initial = '', tool = null, autostart = false, turnstileSiteKey = '', examples = ['wikipedia.org', 'github.com', 'bbc.co.uk', 'shopify.com'], label = 'Scan website', error: serverError = null }: { initial?: string; tool?: string | null; autostart?: boolean; turnstileSiteKey?: string; examples?: string[]; label?: string; error?: string | null } = $props();

  let value = $state(initial);
  let busy = $state(false);
  let checking = $state(false);
  let error = $state<string | null>(serverError);
  let scan = $state<{ id: string; host: string } | null>(null);
  let turnstile: Turnstile | undefined = $state();
  let input: HTMLInputElement | undefined = $state();
  const clean = (v: string) => v.trim().replace(/^https?:\/\//i, '');
  const suffix = (notice?: string | null) => {
    const q = new URLSearchParams();
    if (tool) q.set('tool', tool);
    if (notice) q.set('notice', notice);
    const s = q.toString();
    return s ? `?${s}` : '';
  };

  async function submit(e?: SubmitEvent) {
    e?.preventDefault();
    const url = clean(value);
    if (!url) {
      error = 'Enter a website address.';
      input?.focus();
      return;
    }
    busy = true;
    error = null;
    try {
      let token: string | undefined;
      if (turnstile) {
        checking = true;
        token = (await turnstile.waitForToken()) ?? undefined;
        checking = false;
        if (!token) {
          error = 'The human check did not complete. Please wait a moment and try again.';
          turnstile.reset();
          return;
        }
      }
      const r = await fetch('/api/scans', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'x-scan-source': 'web' }, body: JSON.stringify({ url, turnstileToken: token }) });
      const j = (await r.json()) as { scanId?: string; cached?: boolean; notice?: string | null; error?: string };
      if (!r.ok || !j.scanId) {
        error = j.error ?? 'Something went wrong. Please try again.';
        turnstile?.reset();
        return;
      }
      if (j.cached) {
        await goto(`/r/${j.scanId}${suffix(j.notice)}`);
        return;
      }
      scan = { id: j.scanId, host: url.replace(/[/?#].*$/, '') };
    } catch {
      error = 'Could not reach the scanner. Check your connection and try again.';
    } finally {
      busy = false;
      checking = false;
    }
  }

  onMount(() => {
    if (autostart && clean(value)) void submit();
  });
</script>

<form class="ss-scan" method="POST" onsubmit={submit} novalidate>
  <div class="ss-scanbox">
    <span class="pre" aria-hidden="true">https://</span>
    <label class="eui-sr" for="url-{tool ?? 'quick'}">Website address</label>
    <input id="url-{tool ?? 'quick'}" name="url" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="example.com" bind:value bind:this={input} required />
    <button type="submit" class="eui-btn" disabled={busy}>
      {#if busy}<span class="ss-spin"></span>{:else}<Icon name="search" />{/if}
      {checking ? 'Checking…' : busy ? 'Starting…' : label}
    </button>
  </div>
  {#if turnstileSiteKey}<div style="margin-top: 12px"><Turnstile bind:this={turnstile} siteKey={turnstileSiteKey} /></div>{/if}
  {#if error}<div class="ss-alert err" role="alert"><Icon name="alert" /><div>{error}</div></div>{/if}
  <div class="ss-try"><span>Try</span>{#each examples as ex}<button type="button" onclick={() => { value = ex; input?.focus(); }}>{ex}</button>{/each}</div>
</form>

{#if scan}<ScanModal scanId={scan.id} host={scan.host} after={suffix()} />{/if}
