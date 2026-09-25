<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  let { children, data } = $props();
</script>

<header class="site-header">
  <div class="container">
    <a class="brand" href="/"><img src="/favicon.svg" alt="" width="22" height="22" /> {data.siteName}</a>
    <nav class="nav" aria-label="Main">
      <a href="/bot">About the scanner</a>
      <a href="/privacy">Privacy</a>
      {#if page.data.admin}<a href="/admin">Admin</a>{/if}
    </nav>
  </div>
</header>
<main class="container">
  {@render children()}
</main>
<footer class="site-footer">
  <div class="container">
    {data.siteName} reads only what any visitor's browser would. Results describe what was observed and are not a security audit.
    Site owners can <a href="/bot#opt-out">opt out</a>{#if data.abuseContact} or contact <a href="mailto:{data.abuseContact}">{data.abuseContact}</a>{/if}.
  </div>
</footer>
