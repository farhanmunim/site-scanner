<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  let dark = $state(true);
  const effective = () => document.documentElement.getAttribute('data-theme') !== 'light';
  onMount(() => (dark = effective()));
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

<button class="eui-iconbtn no-print" type="button" onclick={toggle} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title={dark ? 'Light theme' : 'Dark theme'}><Icon name={dark ? 'sun' : 'moon'} /></button>
