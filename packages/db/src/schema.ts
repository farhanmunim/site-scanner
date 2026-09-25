import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import type { GatheredData, Report, StageMeta, StageName } from '@site-scanner/core/types';

/**
 * Owner-private storage. Public users never read these tables directly; the web app
 * exposes a scan only through its unguessable id.
 */

export const scanStatus = ['queued', 'running', 'complete', 'partial', 'restricted', 'failed'] as const;
export type ScanStatus = (typeof scanStatus)[number];

export const scans = pgTable(
  'scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    host: varchar('host', { length: 253 }).notNull(),
    displayHost: varchar('display_host', { length: 253 }).notNull(),
    registrableDomain: varchar('registrable_domain', { length: 253 }).notNull(),
    inputUrl: text('input_url').notNull(),
    url: text('url').notNull(),
    finalUrl: text('final_url'),
    status: varchar('status', { length: 16 }).$type<ScanStatus>().notNull().default('queued'),
    scannerVersion: varchar('scanner_version', { length: 32 }),
    fingerprintsVersion: varchar('fingerprints_version', { length: 64 }),
    stages: jsonb('stages').$type<Record<StageName, StageMeta>>(),
    gathered: jsonb('gathered').$type<GatheredData>(),
    report: jsonb('report').$type<Report>(),
    error: text('error'),
    screenshotPath: text('screenshot_path'),
    requesterIpHash: varchar('requester_ip_hash', { length: 64 }),
    requesterCountry: varchar('requester_country', { length: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    durationMs: integer('duration_ms')
  },
  (t) => [index('scans_host_created_idx').on(t.host, t.createdAt), index('scans_url_created_idx').on(t.url, t.createdAt), index('scans_domain_idx').on(t.registrableDomain), index('scans_created_idx').on(t.createdAt)]
);

/** Every lookup request, including cache hits and refusals. This is the "searches" log. */
export const lookups = pgTable(
  'lookups',
  {
    id: serial('id').primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    input: text('input').notNull(),
    host: varchar('host', { length: 253 }),
    registrableDomain: varchar('registrable_domain', { length: 253 }),
    scanId: uuid('scan_id').references(() => scans.id, { onDelete: 'set null' }),
    cacheHit: boolean('cache_hit').notNull().default(false),
    refusedReason: text('refused_reason'),
    /** Raw IP kept for abuse handling, nulled by the retention job after IP_RETENTION_DAYS. */
    ip: varchar('ip', { length: 45 }),
    ipHash: varchar('ip_hash', { length: 64 }),
    country: varchar('country', { length: 2 }),
    userAgent: text('user_agent'),
    referrer: text('referrer'),
    source: varchar('source', { length: 16 }).notNull().default('web') // web | api | admin
  },
  (t) => [index('lookups_created_idx').on(t.createdAt), index('lookups_domain_idx').on(t.registrableDomain), index('lookups_ip_hash_idx').on(t.ipHash)]
);

/** Flattened detections for faceted queries in the admin console. */
export const scanTechnologies = pgTable(
  'scan_technologies',
  {
    id: serial('id').primaryKey(),
    scanId: uuid('scan_id')
      .notNull()
      .references(() => scans.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 120 }).notNull(),
    category: varchar('category', { length: 80 }),
    version: varchar('version', { length: 40 }),
    confidence: varchar('confidence', { length: 8 }).notNull(),
    implied: boolean('implied').notNull().default(false)
  },
  (t) => [index('scan_tech_scan_idx').on(t.scanId), index('scan_tech_slug_idx').on(t.slug), index('scan_tech_category_idx').on(t.category)]
);

export const domains = pgTable('domains', {
  registrableDomain: varchar('registrable_domain', { length: 253 }).primaryKey(),
  firstScannedAt: timestamp('first_scanned_at', { withTimezone: true }).notNull().defaultNow(),
  lastScannedAt: timestamp('last_scanned_at', { withTimezone: true }).notNull().defaultNow(),
  scanCount: integer('scan_count').notNull().default(0),
  latestScanId: uuid('latest_scan_id'),
  /** Restricted-access cool-down: no fresh scans until this time. */
  cooldownUntil: timestamp('cooldown_until', { withTimezone: true }),
  cooldownReason: text('cooldown_reason'),
  note: text('note')
});

/** Domains that opted out or were blocked by the owner. */
export const blocklist = pgTable('blocklist', {
  id: serial('id').primaryKey(),
  domain: varchar('domain', { length: 253 }).notNull().unique(),
  reason: text('reason'),
  source: varchar('source', { length: 16 }).notNull().default('admin'), // admin | opt-out
  contact: text('contact'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

/** Key/value settings editable from the admin console (kill switch, limits). */
export const settings = pgTable('settings', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/** Cache for external API responses (PSI, Safe Browsing, WordPress.org, Wordfence…). */
export const apiCache = pgTable(
  'api_cache',
  {
    key: varchar('key', { length: 512 }).primaryKey(),
    value: jsonb('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
  },
  (t) => [index('api_cache_expires_idx').on(t.expiresAt)]
);

/** Worker heartbeats for the admin health page. */
export const workers = pgTable('workers', {
  id: varchar('id', { length: 64 }).primaryKey(),
  role: varchar('role', { length: 16 }).notNull(),
  hostname: varchar('hostname', { length: 128 }),
  version: varchar('version', { length: 32 }),
  browser: boolean('browser').notNull().default(false),
  currentScanId: uuid('current_scan_id'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  memoryMb: integer('memory_mb'),
  scansDone: integer('scans_done').notNull().default(0)
});
