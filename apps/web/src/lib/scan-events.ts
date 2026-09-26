import type { Report, StageMeta, StageName } from '@site-scanner/core/types';

export interface ScanUpdate {
  status: string;
  stages?: Partial<Record<StageName, StageMeta>> | null;
  report?: Report | null;
  error?: string | null;
}

export const TERMINAL = new Set(['complete', 'partial', 'restricted', 'failed']);

/**
 * Follow a scan: server-sent events with a polling fallback. Calls `onUpdate` for every
 * change and stops by itself once the status is terminal. Returns an unsubscribe function.
 */
export function subscribeScan(id: string, onUpdate: (u: ScanUpdate) => void, opts: { lite?: boolean } = {}): () => void {
  const q = opts.lite ? '?lite=1' : '';
  let es: EventSource | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  const stop = () => {
    stopped = true;
    es?.close();
    es = null;
    if (poll) clearInterval(poll);
    poll = null;
  };
  const apply = (u: ScanUpdate) => {
    if (stopped) return;
    onUpdate(u);
    if (TERMINAL.has(u.status)) stop();
  };
  // The server ends the stream itself once the status is terminal; `stop` handles that.
  const startPoll = () => {
    if (poll || stopped) return;
    const tick = async () => {
      try {
        const r = await fetch(`/api/scans/${id}${q}`, { headers: { accept: 'application/json' } });
        if (r.ok) apply((await r.json()) as ScanUpdate);
      } catch {
        /* retry next tick */
      }
    };
    void tick();
    poll = setInterval(tick, 2000);
  };
  // Belt and braces: if the event stream goes quiet (a proxy buffering it, a dropped
  // connection that never errors), fall back to polling as well.
  let lastMessage = Date.now();
  const watchdog = setInterval(() => {
    if (!stopped && Date.now() - lastMessage > 12_000) startPoll();
  }, 4000);
  const stopAll = () => {
    clearInterval(watchdog);
    stop();
  };
  try {
    es = new EventSource(`/api/scans/${id}/events${q}`);
    es.onmessage = (e) => {
      lastMessage = Date.now();
      apply(JSON.parse(e.data) as ScanUpdate);
    };
    es.onerror = () => {
      es?.close();
      es = null;
      startPoll();
    };
  } catch {
    startPoll();
  }
  return stopAll;
}
