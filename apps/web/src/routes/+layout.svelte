<script lang="ts">
  let { children, data } = $props();
</script>

<svelte:head>
  {#if data.umami}<script defer src={data.umami.script} data-website-id={data.umami.websiteId}></script>{/if}
</svelte:head>

{@render children()}
