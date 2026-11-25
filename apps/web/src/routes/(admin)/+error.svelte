<script lang="ts">
  import { page } from '$app/state';
  let notFound = $derived(page.status === 404);
</script>

<svelte:head><title>{notFound ? 'Not found' : 'Something went wrong'}</title></svelte:head>

<div class="ad-head"><div><span class="eui-eyebrow">Error {page.status}</span><h1>{notFound ? 'Page not found' : 'Something went wrong'}</h1><p>{notFound ? 'That admin page does not exist.' : (page.error?.message ?? 'An unexpected error occurred.')}</p></div></div>
<div class="ss-row"><a class="eui-btn" href="/admin">Back to overview</a>{#if !notFound}<a class="eui-btn outline" href={page.url.pathname}>Try again</a>{/if}</div>
