<script lang="ts">
  import '$lib/v2/design.css';
  import '$lib/v2/app.css';
  import { page } from '$app/state';
  import Mark from '$lib/v2/Mark.svelte';
  import ThemeToggle from '$lib/v2/ThemeToggle.svelte';
  let { children, data } = $props();
  const path = $derived(page.url.pathname.replace(/\/$/, '') || '/');
  const current = (href: string) => (path === href ? ('page' as const) : undefined);
  const onReport = $derived(path.startsWith('/r/'));
</script>

<div class="v2">
  <a class="skip" href="#main">Skip to content</a>
  <header class="topbar band" style="border-top: 0">
    <div class="frame">
      <a class="logo" href="/" aria-label="{data.siteName} home"><Mark /><span class="name">{data.siteName}</span></a>
      <nav class="topnav" aria-label="Primary">
        <a href="/" aria-current={current('/')}>Scanner</a>
        <a href="/bot" aria-current={current('/bot')}>How it works</a>
        <a href="/privacy" aria-current={current('/privacy')}>Privacy</a>
        {#if data.admin}<a href="/admin">Admin</a>{/if}
      </nav>
      <div class="nav-r">
        <ThemeToggle />
        <a class="btn primary sm wide" href="/">{onReport ? 'Scan another site' : 'New scan'}</a>
      </div>
    </div>
    <nav class="mnav-links" aria-label="Primary">
      <a href="/" aria-current={current('/')}>Scanner</a>
      <a href="/bot" aria-current={current('/bot')}>How it works</a>
      <a href="/privacy" aria-current={current('/privacy')}>Privacy</a>
    </nav>
  </header>

  <main id="main">
    {@render children()}
  </main>

  <footer class="band v2-foot">
    <div class="frame">
      <div class="foot">
        <div>
          <a class="logo" href="/"><Mark />{data.siteName}</a>
          <p class="small" style="margin-top: 12px; max-width: 32ch">Plain-language website reports. Free, no account, nothing is probed.</p>
        </div>
        <div>
          <h4>Product</h4>
          <ul><li><a href="/">Scanner</a></li><li><a href="/bot">How it works</a></li></ul>
        </div>
        <div>
          <h4>Legal</h4>
          <ul><li><a href="/privacy">Privacy</a></li><li><a href="/bot#opt-out">Opt out</a></li></ul>
        </div>
        <div>
          <h4>More</h4>
          <ul><li><a href="https://farhan.app/" rel="noopener">Built by Farhan</a></li><li><a href="/archive/v1">Archived design</a></li></ul>
        </div>
      </div>
      <div class="legal"><span class="built">{data.siteName}</span><a class="built link-muted" href="https://farhan.app/" rel="noopener">Built by Farhan</a></div>
    </div>
  </footer>
</div>
