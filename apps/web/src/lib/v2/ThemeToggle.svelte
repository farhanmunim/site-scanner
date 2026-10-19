<script lang="ts">
  import { onMount } from 'svelte';
  let dark = $state(false);
  const effective = () => {
    const a = document.documentElement.getAttribute('data-theme');
    return a ? a === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  };
  onMount(() => {
    dark = effective();
  });
  function toggle() {
    const next = effective() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    dark = next === 'dark';
    try {
      localStorage.setItem('ss-theme', next);
    } catch {
      /* private mode */
    }
  }
</script>

<button class="iconbtn no-print" type="button" onclick={toggle} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title={dark ? 'Light theme' : 'Dark theme'}>
  {#if dark}
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="2.8" /><path d="M8 1.5v1.4M8 13.1v1.4M1.5 8h1.4M13.1 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></svg>
  {:else}
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 9.5A5.5 5.5 0 0 1 6.5 3 5.5 5.5 0 1 0 13 9.5Z" /></svg>
  {/if}
</button>
