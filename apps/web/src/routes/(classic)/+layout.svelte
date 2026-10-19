<script lang="ts">
  import '../../app.css';
  import { page } from '$app/state';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  let { children, data } = $props();
  const base = $derived(page.url.pathname.startsWith('/archive/v1') ? '/archive/v1' : '');
  let onHome = $derived(page.url.pathname === base || page.url.pathname === base + '/');
</script>

<!-- The two designs ship different global CSS: every navigation out of this shell is a full page load. -->
<div style="display: contents" data-sveltekit-reload data-sveltekit-preload-data="off">

<header class="hdr">
  <a class="brand" href={base || '/'} aria-label="{data.siteName} home">
    <span class="brand-icon" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="5.5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" stroke-linecap="round" /></svg></span>
    <span class="brand-title">{data.siteName}</span>
  </a>
  <ul class="navi">
    <li><a href={base || '/'} class:active={onHome}>Scanner</a></li>
    <li><a href="{base}/bot" class:active={page.url.pathname === base + '/bot'}>How it works</a></li>
    {#if page.data.admin}<li><a href="/admin" class:active={page.url.pathname.startsWith('/admin')}>Admin</a></li>{/if}
  </ul>
  <div class="hactions">
    <ThemeToggle />
    <a class="btn btn-primary" href={onHome ? '#url' : base || '/'}>{page.url.pathname.includes('/r/') ? 'Scan another site' : '+ New scan'}</a>
  </div>
</header>
<main class="main">
  {@render children()}
</main>
<footer class="foot">
  <span><b>{data.siteName}</b> · plain-language website reports</span>
  <nav aria-label="Footer">
    <a href="{base}/bot">How it works</a>
    <a href="{base}/privacy">Privacy</a>
    {#if base}<a href="/">Current design</a>{/if}
    <a href="https://farhan.app/" rel="noopener">Built by Farhan</a>
  </nav>
</footer>
</div>
