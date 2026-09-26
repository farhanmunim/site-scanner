<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  let { children, data } = $props();
  let onHome = $derived(page.url.pathname === '/');
  const year = new Date().getFullYear();
</script>

<svelte:head>
  {#if data.umami}<script defer src={data.umami.script} data-website-id={data.umami.websiteId}></script>{/if}
</svelte:head>

<header class="site-header">
  <div class="container">
    <a class="brand" href="/" aria-label="{data.siteName} home"><img src="/favicon.svg" alt="" width="26" height="26" /><span>{data.siteName}</span></a>
    <nav class="nav" aria-label="Main">
      {#if page.data.admin}<a href="/admin">Admin</a>{/if}
      {#if !onHome}<a class="button secondary sm" href="/">New scan</a>{/if}
    </nav>
  </div>
</header>
<main class="container">
  {@render children()}
</main>
<footer class="site-footer">
  <div class="container">
    <span>© {year} farhan.app</span>
    <a href="/bot">How it works</a>
    <a href="/privacy">Privacy</a>
  </div>
</footer>
