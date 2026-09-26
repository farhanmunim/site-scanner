<script lang="ts">
  import { onMount } from 'svelte';
  /**
   * Cloudflare Turnstile, rendered explicitly so it appears reliably on first paint and can be
   * reset after each submit (auto-render misses elements on hydration).
   */
  let { siteKey }: { siteKey: string } = $props();
  let el: HTMLDivElement;
  let widgetId: string | undefined;

  type TurnstileApi = { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id: string) => void };
  const api = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;

  export function reset() {
    try {
      if (widgetId) api()?.reset(widgetId);
    } catch {
      /* widget gone */
    }
  }

  onMount(() => {
    const render = () => {
      const t = api();
      if (!t || widgetId) return;
      widgetId = t.render(el, { sitekey: siteKey, size: 'flexible', theme: 'light', appearance: 'interaction-only' });
    };
    if (api()) render();
    else {
      (window as unknown as Record<string, unknown>).__onTurnstileLoad = render;
      if (!document.querySelector('script[data-turnstile]')) {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__onTurnstileLoad&render=explicit';
        s.async = true;
        s.defer = true;
        s.dataset.turnstile = '1';
        document.head.appendChild(s);
      }
    }
    return () => {
      try {
        if (widgetId) api()?.remove(widgetId);
      } catch {
        /* ignore */
      }
      widgetId = undefined;
    };
  });
</script>

<div class="turnstile" bind:this={el}></div>
