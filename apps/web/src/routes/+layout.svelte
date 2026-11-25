<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  let { children, data } = $props();

  let theme = $state<'light' | 'dark'>('light');
  onMount(() => {
    theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  });
  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.cookie = `theme=${theme}; path=/; max-age=31536000; samesite=lax`;
  }
</script>

<header class="site-header">
  <div class="container">
    <a class="brand" href="/"><img src="/favicon.svg" alt="" width="22" height="22" /> {data.siteName}</a>
    <nav class="nav" aria-label="Main">
      <a href="/bot">About<span class="wide-only"> the scanner</span></a>
      <a href="/privacy">Privacy</a>
      {#if page.data.admin}<a href="/admin">Admin</a>{/if}
      <button type="button" class="theme-toggle" onclick={toggleTheme} aria-label="Switch to {theme === 'dark' ? 'light' : 'dark'} theme" title="Switch to {theme === 'dark' ? 'light' : 'dark'} theme">{theme === 'dark' ? 'Light' : 'Dark'}</button>
    </nav>
  </div>
</header>
<main class="container">
  {@render children()}
</main>
<footer class="site-footer">
  <div class="container">
    {data.siteName} analyses publicly accessible website responses only. It never logs in, submits forms or probes for hidden files. Results describe what was observed and are not a security audit.
    {#if data.abuseContact}<br />Site owners can opt out on the <a href="/bot">bot page</a> or contact <a href="mailto:{data.abuseContact}">{data.abuseContact}</a>.{/if}
  </div>
</footer>
