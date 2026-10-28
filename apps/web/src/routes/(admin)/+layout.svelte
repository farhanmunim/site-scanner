<script lang="ts">
  import '$lib/ui/css/layers.css';
  import '$lib/ui/css/fonts.css';
  import '$lib/ui/css/tokens.css';
  import '$lib/ui/css/theme.css';
  import '$lib/ui/css/base.css';
  import '$lib/ui/css/primitives.css';
  import '$lib/ui/ui.css';
  import '$lib/ui/admin.css';
  import { page } from '$app/state';
  import Mark from '$lib/ui/Mark.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import ThemeToggle from '$lib/ui/ThemeToggle.svelte';
  let { children, data } = $props();
  const path = $derived(page.url.pathname.replace(/\/$/, '') || '/');
  const links: [string, string, string][] = [
    ['/admin', 'Overview', 'grid'],
    ['/admin/lookups', 'Lookups', 'search'],
    ['/admin/scans', 'Scans', 'list'],
    ['/admin/technologies', 'Technologies', 'layers'],
    ['/admin/domains', 'Domains', 'globe'],
    ['/admin/blocklist', 'Blocklist', 'ban'],
    ['/admin/settings', 'Settings', 'gear'],
    ['/admin/health', 'Health', 'pulse']
  ];
  const current = (href: string) => (href === '/admin' ? path === href : path === href || path.startsWith(href + '/'));
</script>

<svelte:head><meta name="robots" content="noindex, nofollow" /></svelte:head>

<div class="ss">
  <a class="ss-skip" href="#main">Skip to content</a>
  <header class="ss-nav">
    <div class="ss-wrap ss-nav-in">
      <a class="ss-logo" href="/admin" aria-label="Admin home"><span class="ss-logo-mark"><Mark /></span><span class="ss-logo-name">{data.siteName}</span></a>
      <span class="ss-chip">Admin</span>
      <div class="ss-spacer"></div>
      <a class="eui-btn ghost sm" href="/" data-sveltekit-reload>View site <Icon name="external" size={13} /></a>
      <div class="ss-iconbtn-wrap"><ThemeToggle /></div>
    </div>
  </header>

  <main id="main">
    <div class="ss-wrap">
      <div class="ad-shell" class:solo={!data.admin}>
        {#if data.admin}
          <nav class="ad-nav" aria-label="Admin">
            <div class="grp">Scanner</div>
            {#each links.slice(0, 5) as [href, label, icon]}<a {href} aria-current={current(href) ? 'page' : undefined}><Icon name={icon} />{label}</a>{/each}
            <div class="grp">Control</div>
            {#each links.slice(5) as [href, label, icon]}<a {href} aria-current={current(href) ? 'page' : undefined}><Icon name={icon} />{label}</a>{/each}
            <div class="sp"></div>
            <form method="POST" action="/admin/logout"><button type="submit"><Icon name="logout" />Log out</button></form>
          </nav>
        {/if}
        <div>{@render children()}</div>
      </div>
    </div>
  </main>
</div>
