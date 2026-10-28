import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { GatheredData, Report } from '@site-scanner/core';
import { log } from './log.js';

/**
 * analyse() is pure but runs third-party regexes over attacker-controlled pages, and some of them
 * are quadratic. Running it in a child process with a deadline means the worst case is a failed
 * report, never a frozen worker (which would also block lock renewal and the heartbeat).
 * A process (not a thread) is used so the child loads TypeScript exactly like the worker does.
 */
let child: ChildProcess | null = null;
let seq = 0;
/** Requests belong to the process they were sent to: a killed process must only fail its own, never a later one's. */
const pending = new Map<number, { owner: ChildProcess; resolve: (r: Report) => void; reject: (e: Error) => void }>();

function spawn(): ChildProcess {
  const c = fork(fileURLToPath(new URL('./analyse-thread.ts', import.meta.url)), [], { execArgv: ['--import', 'tsx'], serialization: 'advanced', stdio: ['ignore', 'inherit', 'inherit', 'ipc'], execPath: process.execPath });
  c.on('message', (m: { id: number; report?: Report; error?: string }) => {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.report) p.resolve(m.report);
    else p.reject(new Error(m.error ?? 'analyse failed'));
  });
  const fail = (e: Error) => {
    for (const [id, p] of pending) {
      if (p.owner !== c) continue;
      pending.delete(id);
      p.reject(e);
    }
    if (child === c) child = null;
  };
  c.on('error', fail);
  c.on('exit', (code) => fail(new Error(`analyse process exited (${code})`)));
  return c;
}

// One analysis at a time, each with its own deadline.
let chain: Promise<unknown> = Promise.resolve();

export function analyseInThread(data: GatheredData, timeoutMs = 25_000): Promise<Report> {
  const run = () =>
    new Promise<Report>((resolve, reject) => {
      const id = ++seq;
      const c = (child ??= spawn());
      const timer = setTimeout(() => {
        pending.delete(id);
        log.warn({ timeoutMs }, 'analyse exceeded its deadline; killing the analysis process');
        child = null;
        c.kill('SIGKILL');
        reject(new Error('Analysis took too long and was stopped'));
      }, timeoutMs);
      pending.set(id, {
        owner: c,
        resolve: (r) => (clearTimeout(timer), resolve(r)),
        reject: (e) => (clearTimeout(timer), reject(e))
      });
      c.send({ id, data }, (err) => {
        if (err) {
          clearTimeout(timer);
          pending.delete(id);
          reject(err);
        }
      });
    });
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

export async function stopAnalyseThread(): Promise<void> {
  child?.kill('SIGKILL');
  child = null;
}
