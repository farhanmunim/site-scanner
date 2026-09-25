<script lang="ts">
  import { page } from '$app/state';
  let { children, data } = $props();
  const links = [
    ['/admin', 'Overview'],
    ['/admin/lookups', 'Lookups'],
    ['/admin/scans', 'Scans'],
    ['/admin/technologies', 'Technologies'],
    ['/admin/domains', 'Domains'],
    ['/admin/blocklist', 'Blocklist'],
    ['/admin/settings', 'Settings'],
    ['/admin/health', 'Health']
  ];
</script>

<svelte:head><meta name="robots" content="noindex" /></svelte:head>

{#if data.admin}
  <nav class="admin-nav" aria-label="Admin">
    {#each links as [href, label]}<a {href} class:active={page.url.pathname === href}>{label}</a>{/each}
    <form method="POST" action="/admin/logout" style="margin-left: auto"><button class="secondary" type="submit">Log out</button></form>
  </nav>
{/if}
{@render children()}
