<script lang="ts">
  import { page } from '$app/state';
  let notFound = $derived(page.status === 404);
</script>

<svelte:head><title>{notFound ? 'Not found' : 'Something went wrong'}</title></svelte:head>

<div class="ss-wrap">
  <div class="ss-error">
    <span class="eui-eyebrow">Error {page.status}</span>
    <h1>{notFound ? 'Page not found' : 'Something went wrong'}</h1>
    <p>{notFound ? 'That link does not point to anything here. Reports are removed when data is deleted or expires.' : (page.error?.message ?? 'An unexpected error occurred.')}</p>
    <div class="ss-row center">
      <a class="eui-btn" href="/">Scan a website</a>
      {#if !notFound}<a class="eui-btn outline" href={page.url.pathname}>Try again</a>{/if}
    </div>
  </div>
</div>
