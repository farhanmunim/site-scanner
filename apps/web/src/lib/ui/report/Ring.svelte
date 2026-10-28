<script lang="ts">
  import type { Tone } from './helpers';
  let { value, tone = '', grade = null, size = '' }: { value: number | null; tone?: Tone; grade?: string | null; size?: 'sm' | '' } = $props();
  const C = 2 * Math.PI * 44;
  let off = $derived(C * (1 - (value ?? 0) / 100));
</script>

<div class="ss-ring {tone} {size}" role="img" aria-label={value === null ? 'Not scored' : `Score ${value} out of 100`}>
  <svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="44" /><circle class="val" cx="50" cy="50" r="44" stroke-dasharray={C} stroke-dashoffset={value === null ? C : off} /></svg>
  <div class="n"><b>{value ?? '–'}</b>{#if grade}<span>Grade {grade}</span>{:else if value !== null}<span>/ 100</span>{/if}</div>
</div>
