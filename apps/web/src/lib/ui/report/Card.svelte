<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Tone } from './helpers';
  let { id, title, desc = '', chip = null, tone = '', children, actions }: { id: string; title: string; desc?: string; chip?: string | null; tone?: Tone; children: Snippet; actions?: Snippet } = $props();
</script>

<section class="ss-card" id="s-{id}">
  <header>
    <div><h2>{title}</h2>{#if desc}<p>{desc}</p>{/if}</div>
    <div class="ss-row">{#if actions}{@render actions()}{/if}{#if chip}<span class="ss-chip {tone}">{chip}</span>{/if}</div>
  </header>
  <div class="body">{@render children()}</div>
</section>
