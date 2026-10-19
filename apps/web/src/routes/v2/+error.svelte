<script lang="ts">
  import { page } from '$app/state';
  let notFound = $derived(page.status === 404);
</script>

<svelte:head><title>{notFound ? 'Not found' : 'Something went wrong'}</title></svelte:head>

<div class="frame">
  <div class="hero">
    <h1 class="h-display two-tone"><span class="lead">{notFound ? '404' : String(page.status)}</span><span class="tail">{notFound ? 'Page not found' : 'Something went wrong'}</span></h1>
    <div>
      <p class="sec-desc">{notFound ? 'That link does not point to anything here. Reports are removed when data is deleted or expires.' : (page.error?.message ?? 'An unexpected error occurred.')}</p>
      <div class="row" style="margin-top: 20px">
        <a class="btn primary" href="/v2">Scan a website</a>
        {#if !notFound}<a class="btn outline" href={page.url.pathname}>Try again</a>{/if}
      </div>
    </div>
  </div>
</div>
