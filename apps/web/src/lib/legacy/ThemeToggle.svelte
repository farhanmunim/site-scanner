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

<button class="ibtn no-print" type="button" onclick={toggle} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title={dark ? 'Light theme' : 'Dark theme'}>
  {#if dark}
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
  {:else}
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
  {/if}
</button>
