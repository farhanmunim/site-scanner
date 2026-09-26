<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  let { children, data } = $props();
  let onHome = $derived(page.url.pathname === '/');
  const year = new Date().getFullYear();
</script>

<svelte:head>
  {#if data.umami}<script defer src={data.umami.script} data-website-id={data.umami.websiteId}></script>{/if}
</svelte:head>

<header class="hdr">
  <a class="brand" href="/" aria-label="{data.siteName} home">
    <span class="brand-icon" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="5.5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" stroke-linecap="round" /></svg></span>
    <span class="brand-title">{data.siteName}</span>
  </a>
  <ul class="navi">
    <li><a href="/" class:active={onHome}>Scanner</a></li>
    <li><a href="/bot" class:active={page.url.pathname === '/bot'}>How it works</a></li>
    {#if page.data.admin}<li><a href="/admin" class:active={page.url.pathname.startsWith('/admin')}>Admin</a></li>{/if}
  </ul>
  <div class="hactions">
    <ThemeToggle />
    <a class="btn btn-primary" href={onHome ? '#url' : '/'}>+ New scan</a>
  </div>
</header>
<main class="main">
  {@render children()}
</main>
<footer class="foot">
  <span><b>{data.siteName}</b> · plain-language website reports</span>
  <nav aria-label="Footer">
    <a href="/bot">How it works</a>
    <a href="/privacy">Privacy</a>
    <span>© {year} farhan.app</span>
  </nav>
</footer>
