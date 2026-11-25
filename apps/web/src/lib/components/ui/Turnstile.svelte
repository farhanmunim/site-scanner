<script lang="ts">
  import { onMount } from 'svelte';
  /**
   * Cloudflare Turnstile, rendered explicitly so it appears reliably on first paint and can be
   * reset after each submit (auto-render misses elements on hydration).
   */
  let { siteKey }: { siteKey: string } = $props();
  let el: HTMLDivElement;
  let widgetId: string | undefined;
  let current: string | null = null;
  let failed = false;

  type TurnstileApi = { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id: string) => void; getResponse: (id?: string) => string | undefined };
  const api = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;

  export function reset() {
    current = null;
    failed = false;
    try {
      if (widgetId) api()?.reset(widgetId);
    } catch {
      /* widget gone */
    }
  }

  /** Current response token, if the challenge has been passed. */
  export function token(): string | null {
    try {
      if (widgetId) return api()?.getResponse(widgetId) || current || null;
    } catch {
      /* ignore */
    }
    return current || el?.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value || null;
  }

  /**
   * The token is issued asynchronously after the widget loads; a fast submit can beat it.
   * Wait for it (up to `ms`) instead of sending an empty challenge.
   */
  export async function waitForToken(ms = 12000): Promise<string | null> {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const t = token();
      if (t) return t;
      if (failed) return null;
      await new Promise((r) => setTimeout(r, 150));
    }
    return null;
  }

  onMount(() => {
    const render = () => {
      const t = api();
      if (!t || widgetId) return;
      const theme = document.documentElement.getAttribute('data-theme') ?? 'auto';
      failed = false;
      widgetId = t.render(el, {
        sitekey: siteKey,
        size: 'flexible',
        theme,
        appearance: 'interaction-only',
        callback: (tok: string) => {
          current = tok;
          failed = false;
        },
        'expired-callback': () => {
          current = null;
        },
        'error-callback': () => {
          current = null;
          failed = true;
        }
      });
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
