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
  <nav class="subnav" aria-label="Admin">
    {#each links as [href, label]}<a {href} class:active={page.url.pathname === href} aria-current={page.url.pathname === href ? 'page' : undefined}>{label}</a>{/each}
    <form method="POST" action="/admin/logout" class="logout"><button class="btn btn-outline btn-sm" type="submit">Log out</button></form>
  </nav>
{/if}
<div class="admin">
  {@render children()}
</div>
