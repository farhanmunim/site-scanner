import { analyse, type GatheredData } from '@site-scanner/core';

/** Child process entry: runs analyse() so a pathological page can be killed instead of freezing the worker. */
process.on('message', (msg: { id: number; data: GatheredData }) => {
  try {
    const report = analyse(msg.data, { screenshotUrl: (p: string) => `/screenshots/${p}` });
    process.send!({ id: msg.id, report });
  } catch (e) {
    process.send!({ id: msg.id, error: (e as Error).message });
  }
});
