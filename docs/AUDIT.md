# Audit — October 2026

A full engineering audit of code, design, UI, UX, DX and operations. Everything here was found by running the
thing (production build, real Postgres and Redis, a real browser, hostile inputs), not by reading alone.
Each row says what was wrong, how it was proved, and what changed.

Status: **Fixed** = changed and re-tested. **Mitigated** = risk reduced, residual noted. **Open** = known, deliberately left.

## Security

| # | Sev | Finding | Status |
|---|---|---|---|
| 1 | Critical | Every admin form action (`?/add`, `?/purge`, `?/save` …) was callable without logging in: SvelteKit skips layout guards for actions. Proved on a production build. | **Fixed**: central guard in `hooks.server.ts` using the route id *and* the decoded path (the first version was bypassed by `/%61dmin/…`; all encoded variants now return 401). Unit tests + live probes. |
| 2 | High | `/v2//evil.example` open redirect. | **Fixed** |
| 3 | High | Redirect hops and third-party script fetches skipped the denylist, the opt-out list, the own-host check and the port allowlist (a target could 302 the scanner to `whitehouse.gov`, `host:6379`, or this app). | **Fixed**: `safeFetch` re-applies all of them to every URL; IP-literal hosts refused. Tests. |
| 4 | High | The browser stage let page scripts make the scanner send POSTs (300 per scan) to any public host. | **Fixed**: only GET/HEAD, only web ports, never to opted-out hosts. |
| 5 | High | `CF-Connecting-IP` was trusted unconditionally; with a reachable origin it is forgeable, bypassing every rate limit and the login throttle. | **Mitigated**: value must be a real IP, and optional `ORIGIN_SECRET` (+ a Cloudflare Transform Rule) gates it. Best fix is firewalling the origin to Cloudflare (documented). |
| 6 | High | Quadratic/catastrophic regexes (fingerprint DB, retire.js, text extraction) let one hostile page freeze the worker for minutes to hours; it blocks the BullMQ lock renewal and heartbeat too. 108 of 5,716 fingerprint patterns took ≥1 s on adversarial input. | **Fixed**: inputs capped per source; `analyse()` runs in a child process with a hard deadline and is killed on expiry; retire inputs capped. |
| 7 | High | A page that spins the renderer made `page.content()` hang forever and leaked a pegged Chromium. | **Fixed**: 55 s hard deadline that kills the browser; single-flight launch. |
| 8 | Medium | Turnstile tokens are single-use; the form reused them (“Please complete the human check”). | **Fixed** (reset + one automatic retry) |
| 9 | Medium | Rate-limit counters used non-atomic `INCR`/`EXPIRE` and failed open when Redis was down; refused requests were written to `lookups` unlimited. | **Fixed**: atomic Lua, fail closed, front-door limiter before any write. |
| 10 | Medium | `?notice=` rendered attacker text on a trusted page. | **Fixed**: exact allowlist. |
| 11 | Medium | `javascript:` hrefs would render as live links if they ever reached the data. | **Fixed** (`safeHref`) |
| 12 | Medium | undici 8.11.2 had 4 high + 4 moderate advisories. | **Fixed** (8.12.3) |
| 13 | Low | IPv6 gaps: `::7f00:1`, SIIT `::ffff:0:a.b.c.d`, `3fff::/20`, `5f00::/16`. | **Fixed** |
| 14 | Low | Admin session is a stateless 12 h HMAC cookie; TOTP codes can be replayed inside their window. | **Open** (single-owner tool; revisit if multi-user) |
| 15 | Low | Chromium DNS-rebinding TOCTOU and `--no-sandbox`. Chromium’s Local Network Access blocked the rebinding attempt in the tested build. | **Open** (container-isolated; hardening only) |

## Correctness

| # | Sev | Finding | Status |
|---|---|---|---|
| 16 | High | Migrations were not safe to run concurrently (web and worker started together), and web never ran them. | **Fixed**: advisory lock; both processes migrate on start. 4 concurrent runners verified. |
| 17 | High | “Scan already running” dedupe was keyed on the registrable domain: `en.wikipedia.org` returned `de.wikipedia.org`’s scan. | **Fixed**: exact URL, backed by a partial unique index so racing requests collapse onto one scan. |
| 18 | High | `*.github.io`, `*.vercel.app`… were merged into one “domain” (wrong reports, shared 6/h limit and cooldown). | **Fixed** (private suffixes are separate sites) |
| 19 | Medium | Scans could stay `running`/`queued` for up to ~19 min after a crash and block the same URL. | **Fixed**: redelivered jobs fail fast, queued rows reaped after 10 min, housekeeping steps isolated, finalise wrapped. |
| 20 | Medium | A NUL character anywhere in gathered text made Postgres reject the whole scan and leaked DB error text to `scans.error`. | **Fixed**: stripped; public errors are generic. |
| 21 | Medium | The scan timeout didn’t stop `persist` from overwriting a failed row; external sources could fail a healthy scan. | **Fixed**: writes gated after timeout; every external source capped at 55 s with partial results. |
| 22 | Medium | SPF: repeated includes undercounted (RFC 7208 counts each evaluation), `all` read from domain names, `redirect=` mishandled. | **Fixed** + tests |
| 23 | Medium | Version compare treated `1.0.0-beta1` as `1.0.0`; `fixedIn` could name a patch for another branch; WordPress core version was taken from bundled jQuery’s `?ver=` (“WordPress 3.7.1”). | **Fixed** + tests |
| 24 | Medium | DNS verification TXT records (Notion, Canva, Lovable) shown as high-confidence “built with”. | **Fixed** (capped to a weak hint) |
| 25 | Medium | Settings save clamped absent fields to the minimum (stale POST set limits to 1/hour). | **Fixed** |
| 26 | Low | secrets: a pile of low hits hid real keys; translation strings flagged; real keys containing “test” dropped. php: <5.6 not EOL, distro builds flagged EOL, off-site `.php` links. domain: `NaN days`. | **Fixed** + tests |
| 27 | Low | PDF job ids could never be retried after a failure. | **Fixed** |
| 28 | Low | SSE polled the whole report once a second per connection. | **Fixed** (status/stages polled; report read only on change) |
| 29 | Low | Large CSP/cookie headers failed with “Headers Overflow”. | **Fixed** |

## Product, UX and design

| # | Finding | Status |
|---|---|---|
| 30 | Builder detection: Framer was missed; Zyro, SITE123, Ucraft, Pixieset, Typedream, Super, Dorik missing. No single “what is this built with” answer, and a “Not WordPress” card on every non-WordPress site. | **Fixed**: new `platform` verdict (builder / CMS / shop / framework) and a “Platform” section. Verified live: framer.com → Framer Sites, webflow.com → Webflow, squarespace.com → Squarespace. |
| 31 | PDF export: 28 pages, blank page, card chrome, propagation matrix dominating. | **Fixed**: a dedicated print document, black and white with traffic-light status only. Same scan: **3 pages**. |
| 32 | No sitemap, canonical or OG tags; `/tools/<slug>` form gave a raw 405 without JavaScript. | **Fixed** |
| 33 | Admin looked unstyled; FAQ unbalanced; Tools menu overlap; JSON link 404; scan dialog. | **Fixed** earlier in the project |

## Operations and DX

| # | Finding | Status |
|---|---|---|
| 34 | No retention for lookups/scans; missing indexes on `status` and `host`. | **Fixed** (`DATA_RETENTION_DAYS`, two indexes) |
| 35 | Redis ran without persistence, so a restart dropped queued jobs; no `stop_grace_period` so deploys SIGKILLed scans mid-flight. | **Fixed** (AOF, 180 s grace) |
| 36 | Web and worker ran as different UIDs on the shared screenshots volume. | **Fixed** (both uid 1001) |
| 37 | Stale root scripts pointing at removed Cloudflare tooling; no CI. | **Fixed** (scripts removed, GitHub Actions: typecheck, tests, build, concurrent migration) |
| 38 | `dump.rdb` copied into images; undocumented env vars. | **Fixed** |
| 39 | Dockerfile not reproducible: fingerprint DB fetched from a moving ref, floating `node:22`. | **Open**: pass `FINGERPRINTS_REF=<sha>` at build to pin |
| 40 | `ipHash`, user agent and referrer are kept forever (only the raw IP is blanked). | **Open**: now bounded by `DATA_RETENTION_DAYS` |
| 41 | CT/subdomain sources have no response-size cap (only timeouts). | **Open** |
| 42 | `analyse()` still runs 3–4 times per scan (was 7+). | **Mitigated** |

## How it was checked

- 151 core tests (17 new regression tests for the items above) and 5 web tests; typecheck clean.
- Production build: unauthenticated writes to ten encoded admin path variants → 401, no rows written; owner flow works.
- Real scans of framer.com, webflow.com and squarespace.com through the web API, worker and Postgres; a PDF rendered from the new print route.
- Concurrent migrations against a fresh database.

## Follow-up round: free-API budgets and verification

**Spending controls.** Every outside service now has its own per-minute and per-day budget (below the provider's
free allowance), shared by all workers through Redis and shown on the admin Health page. A source over budget is
skipped for that scan, never queued; cache hits cost nothing; if the counter store is down the answer is no. On top
of that sit the per-visitor, per-site, flood and new daily-scan limits.

Checked live, not assumed:

| What | Result |
|---|---|
| VirusTotal budget (3 a minute) with six scans at once | 3 lookups made, 3 refused, all six scans still completed |
| Daily scan cap set to 8 | refused after the cap; a cached repeat was not counted |
| Per-visitor limit set to 3 an hour | 4th and 5th refused |
| Per-site limit (6 an hour), caching off | 7th and 8th answered with the latest result |
| 75 junk requests in a row | 60 handled, 15 refused with no log rows written |
| All 18 focused tools on a fresh site | all complete in 0.3–5.7 s, each ran only its own stages, none scored |
| Hostile page (quadratic markup) | analysis stopped on its deadline; normal scans interleaved with it unaffected |
| Stuck running / stuck queued / expired data | recovered, reaped and deleted; recent data untouched |
| 35 hostile inputs (private IPs, odd ports, credentials, internal names, file/gopher) | all refused; names that merely resolve to 127.0.0.1 refused at resolve |
| Script-injection payloads in every free-text field and every URL (13 views) | 0 executions |
| Accessibility, axe-core, 10 pages x 2 themes | 0 violations (was 3 rule types) |
| Production build | boots and migrates, admin writes 401, headers present, image route refuses traversal and SVG |

Bugs this round found in earlier work: NUL stripping corrupted scripts containing the literal text `\u0000` and failed
those scans (seen on stripe.com); a killed analysis process failed the next request; the favicon picker chose an icon
over the size cap; a headless CMS (Contentful) was reported as the platform; light-theme green and amber text was about
3:1 contrast.
