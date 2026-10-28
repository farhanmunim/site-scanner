<script lang="ts">
  import '$lib/ui/css/layers.css';
  import '$lib/ui/css/fonts.css';
  import '$lib/ui/css/tokens.css';
  import '$lib/ui/css/theme.css';
  import '$lib/ui/css/base.css';
  import '$lib/ui/css/primitives.css';
  import '$lib/ui/ui.css';
  import { page } from '$app/state';
  import { afterNavigate } from '$app/navigation';
  import Mark from '$lib/ui/Mark.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import ThemeToggle from '$lib/ui/ThemeToggle.svelte';
  import { TOOLS } from '$lib/ui/tools';
  let { children, data } = $props();
  const path = $derived(page.url.pathname.replace(/\/$/, '') || '/');
  const current = (href: string) => (path === href ? ('page' as const) : undefined);
  const onHome = $derived(path === '/');
  let menu = $state(false);
  afterNavigate(() => (menu = false));
  function away(e: MouseEvent) {
    if (menu && !(e.target as HTMLElement).closest('.ss-menu-wrap')) menu = false;
  }
</script>

<svelte:window onclick={away} onkeydown={(e) => e.key === 'Escape' && (menu = false)} />

<svelte:head>
  <link rel="canonical" href={data.siteUrl + (path === '/' ? '/' : path)} />
  <meta property="og:site_name" content={data.siteName} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={data.siteUrl + (path === '/' ? '/' : path)} />
  <meta name="twitter:card" content="summary" />
</svelte:head>

<div class="ss">
  <a class="ss-skip" href="#main">Skip to content</a>
  <header class="ss-nav">
    <div class="ss-wrap ss-nav-in">
      <a class="ss-logo" href="/" aria-label="{data.siteName} home"><span class="ss-logo-mark"><Mark /></span><span class="ss-logo-name">{data.siteName}</span></a>
      <nav class="ss-nav-links" aria-label="Primary">
        <a href="/" aria-current={current('/')}>Quick scan</a>
        <div class="ss-menu-wrap">
          <button class="ss-menu-btn" type="button" aria-expanded={menu} aria-haspopup="true" onclick={() => (menu = !menu)}>Tools <Icon name="chevron" size={12} /></button>
          {#if menu}
            <div class="ss-menu" role="menu">
              {#each TOOLS as t (t.slug)}
                <a href="/tools/{t.slug}" role="menuitem"><span class="ss-tool-ico" style="color: var(--text-secondary); margin-top: 2px"><Icon name={t.icon} /></span><span><b>{t.title}</b><span class="d">{t.short}</span></span></a>
              {/each}
              <div class="ss-menu-foot"><a href="/tools">All tools →</a><a href="/bot">How it works</a><a href="/privacy">Privacy</a></div>
            </div>
          {/if}
        </div>
        <a class="opt" href="/bot" aria-current={current('/bot')}>How it works</a>
        <a class="opt" href="/privacy" aria-current={current('/privacy')}>Privacy</a>
        {#if data.admin}<a class="opt" href="/admin" data-sveltekit-reload>Admin</a>{/if}
      </nav>
      <div class="ss-spacer"></div>
      {#if !onHome}
        <form class="ss-nav-scan" method="GET" action="/" role="search">
          <Icon name="search" />
          <input class="eui-input" name="url" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Scan a website…" aria-label="Website address" />
          <input type="hidden" name="go" value="1" />
          {#if path.startsWith('/tools/')}<input type="hidden" name="tool" value={path.slice(7)} />{/if}
        </form>
      {/if}
      <div class="ss-iconbtn-wrap">
        {#if !onHome}<a class="eui-iconbtn ss-nav-scan-m" href="/" aria-label="Scan a website" title="Scan a website"><Icon name="search" /></a>{/if}
        <ThemeToggle />
      </div>
    </div>
  </header>

  <main id="main">
    {@render children()}
  </main>

  <footer class="ss-foot">
    <div class="ss-wrap">
      <div class="ss-foot-grid">
        <div style="max-width: 300px">
          <a class="ss-logo" href="/"><span class="ss-logo-mark"><Mark /></span>{data.siteName}</a>
          <p style="margin-top: 12px; line-height: 1.6">Web utility scans in plain language. Free, no account, and nothing is probed.</p>
        </div>
        <div><p class="fh">Tools</p><ul>{#each TOOLS.slice(0, 5) as t (t.slug)}<li><a href="/tools/{t.slug}">{t.title}</a></li>{/each}<li><a href="/tools">All tools</a></li></ul></div>
        <div><p class="fh">About</p><ul><li><a href="/bot">How it works</a></li><li><a href="/bot#opt-out">Opt out</a></li><li><a href="/privacy">Privacy</a></li></ul></div>
      </div>
      <div class="ss-foot-legal"><span>{data.siteName}</span><a href="https://farhan.app/" rel="noopener">Built by Farhan</a></div>
    </div>
  </footer>
</div>
