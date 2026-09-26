<script lang="ts">
  import type { StageMeta, StageName } from '@site-scanner/core/types';
  let { stages, running }: { stages: Partial<Record<StageName, StageMeta>>; running: boolean } = $props();
  const order: StageName[] = ['dns', 'http', 'files', 'cert', 'rdap', 'browser', 'external'];
  const label: Record<StageName, string> = { dns: 'Looking up DNS and IP', http: 'Loading the page', files: 'Reading robots.txt, sitemap and scripts', cert: 'Checking the certificate', rdap: 'Checking domain registration', browser: 'Rendering in a browser', external: 'Performance and safety checks' };
  const word: Record<string, string> = { pending: 'waiting', complete: 'done', failed: 'failed', restricted: 'blocked by the site', skipped: 'skipped' };
  const text = (s: StageName) => {
    const st = stages[s]?.status ?? 'pending';
    const w = st === 'pending' && running ? 'in progress' : (word[st] ?? st);
    return stages[s]?.note ? `${w} — ${stages[s]!.note}` : w;
  };
</script>

<ul class="stage-list" aria-live="polite">
  {#each order as s}
    {@const st = stages[s]?.status ?? 'pending'}
    <li>
      <span class="dot {st === 'pending' && running ? 'running' : st}" aria-hidden="true"></span>
      <span class="name">{label[s]}</span>
      <span class="muted">{text(s)}</span>
    </li>
  {/each}
</ul>
