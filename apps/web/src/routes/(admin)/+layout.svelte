<script lang="ts">
  import '$lib/styles/base/layers.css';
  import '$lib/styles/base/fonts.css';
  import '$lib/styles/base/tokens.css';
  import '$lib/styles/base/theme.css';
  import '$lib/styles/base/base.css';
  import '$lib/styles/base/primitives.css';
  import '$lib/styles/site/index.css';
  import '$lib/styles/admin.css';
  import { page } from '$app/state';
  import Mark from '$lib/components/ui/Mark.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
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
