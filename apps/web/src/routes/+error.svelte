<script lang="ts">
  import { page } from '$app/state';
  let notFound = $derived(page.status === 404);
</script>

<svelte:head><title>{notFound ? 'Not found' : 'Something went wrong'}</title></svelte:head>

<section class="prose">
  <div class="page-head">
    <h1>{notFound ? 'Page not found' : 'Something went wrong'}</h1>
    <p class="lead">{notFound ? 'That link does not point to anything here. Reports are removed when data is deleted or expires.' : page.error?.message ?? 'An unexpected error occurred.'}</p>
  </div>
  <div class="form-row">
    <a class="btn btn-primary" href="/">Scan a website</a>
    {#if !notFound}<a class="btn btn-outline" href={page.url.pathname}>Try again</a>{/if}
  </div>
</section>
