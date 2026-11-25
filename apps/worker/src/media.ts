/** Stores what the scan fetched alongside the page (the site's share image) outside the database. */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and } from '@site-scanner/db';
import { type GatheredData } from '@site-scanner/core';
import { config } from './config.js';
import { log } from './log.js';

const OG_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

/**
 * The share image goes to the screenshots volume (served by /screenshots) instead of the database: up to 600 KB per
 * scan would bloat jsonb. The favicon is tiny and stays inline.
 */
export async function storeMedia(scanId: string, data: GatheredData): Promise<void> {
  const og = data.files?.media?.ogImage;
  if (!og?.base64) return;
  const ext = OG_EXT[og.contentType];
  if (ext) {
    try {
      await mkdir(config.screenshotDir, { recursive: true });
      const file = `${scanId}-og.${ext}`;
      await writeFile(join(config.screenshotDir, file), Buffer.from(og.base64, 'base64'));
      og.path = file;
    } catch (e) {
      log.warn({ scanId, err: (e as Error).message }, 'could not store the share image');
    }
  }
  delete og.base64;
}
