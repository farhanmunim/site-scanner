# Site Scan

Evidence-backed website intelligence, self-hosted. Enter any public website and get: the
technology stack (with the header/markup/script that gave each item away and a confidence
level), CDN / WAF / hosting / DNS / email provider, registration and certificate details,
HTTP security configuration mapped to OWASP categories, SPF/DKIM/DMARC, SEO signals,
Lighthouse performance, WordPress/Shopify deep dives (with Wordfence vulnerability matching), SPF lookup inspector, blocklists, PHP end-of-life, DNS propagation, AI readiness, vulnerable JS libraries, third-party services and privacy signals.

Public users can scan freely; every lookup and result is stored in the owner's own Postgres
and browsable in a private admin console.

## Layout

```
apps/web         SvelteKit (adapter-node): public UI, JSON API, admin console, SSE progress
apps/worker      BullMQ worker: gather → analyse, Playwright screenshots, housekeeping
packages/core    the scanner: URL/SSRF/target-safety policy, gather stages, fingerprint engine, audits
packages/db      Drizzle schema + migrations (lookups, scans, scan_technologies, domains, blocklist…)
scripts/         fetch-fingerprints.mjs (enthec/webappanalyzer, GPL-3.0), hash-password.mjs (optional 2FA/hash mode)
docker/          Dockerfile (web + worker targets); docker-compose.yaml at the root for Coolify
docs/            PLAN.md (product/architecture), DEPLOY.md (Cloudflare + Coolify runbook)
```

## Quick start

```bash
pnpm install
pnpm fingerprints                 # downloads ~7.6k technology fingerprints
pnpm -r typecheck && pnpm -r test
pnpm scan wordpress.org           # CLI scan, no database needed
```

Deployment: see [docs/DEPLOY.md](docs/DEPLOY.md).

## Safety rules (enforced in code, covered by tests)

- GET/HEAD only; a fixed allowlist of paths per scan; ~25 requests per scan; no crawling.
- Every address is checked against private/loopback/link-local/CGNAT/metadata ranges and the
  deployment's own IPs before a socket is opened (DNS pinned via undici's connect lookup;
  Chromium requests are route-filtered the same way).
- No retry on 403/429/challenge; the domain gets a one-hour cool-down.
- Honest `SiteScanBot/1.0 (+https://<site>/bot)` user agent, public opt-out, denylist for
  government/military/health domains.
- Per-IP and per-domain rate limits, 15-minute cache, dedupe of in-flight scans, queue cap,
  Turnstile, admin kill switch.

## Project layout

```
apps/web/src
  routes/            pages and endpoints, one folder per URL
    (app)/             the public site: home, /tools, /r/:id report
    (admin)/           the owner console (own layout and stylesheet)
    (print)/           the plain document the PDF export renders
    (classic)/         the archived first design under /archive/v1
    api/               POST /api/scans, scan status and live events
  lib/
    components/
      ui/                shared pieces: Icon, Mark, Orb, ThemeToggle, Turnstile
      scan/              the scan form and progress dialog
      report/            one card per report section, plus sections.ts (which sections show, sidebar badges)
    data/tools.ts      the tool catalogue (titles, sections, what each checks)
    server/            server-only code: scan service, auth, admin guard, database, Redis
    styles/
      base/              design tokens, theme, primitives (layer order in layers.css)
      site/              the public site's CSS in numbered parts, imported in order by index.css
      admin.css  print.css  legacy.css
    utils/             formatting and the live scan-event client
    legacy/            components used only by the archived design
apps/worker/src      scan.ts (one job), housekeeping.ts, media.ts, adapters.ts (budgets, cache),
                     analyse-runner.ts (killable analysis), browser.ts, pdf.ts, runtime.ts, index.ts (startup)
packages/core/src
  gather/            the stages that touch the network (dns, http, files, cert, rdap, browser)
  analyze/           pure functions from gathered data to the report (audits, scoring, detection)
  external/          one file per outside source; quota.ts holds every spending limit
  types/             shared data shapes (re-exported from types.ts)
packages/db          Drizzle schema, migrations, advisory-locked migrator
```

CSS order matters: the numbered files in `lib/styles/site/` are imported in sequence and later rules override earlier ones, exactly as the single stylesheet they replaced.

## Licence notes

Application code is private/unlicensed. The fingerprint database is fetched at build time from
[enthec/webappanalyzer](https://github.com/enthec/webappanalyzer) (GPL-3.0) and is not committed.

## Routes

- `/`: quick scan. `/tools` and `/tools/<slug>`: focused tools. A tool runs only the stages and lookups it needs (plans in `packages/core/src/scope.ts`; `POST /api/scans` takes `"tool"`), stored as `scans.scope`. A full scan can answer any tool; a focused scan only its own.
- `/r/<id>`: the full report. `/r/<id>?tool=<slug>` narrows it to one tool's sections. `/bot`, `/privacy`: info pages.
- Design: the farhan.app UI library tokens and primitives (vendored in `apps/web/src/lib/styles/base/`, dark by default). See [Project layout](#project-layout).
- `/archive/v1/…`: the first design, kept for reference (its code lives in `lib/legacy/` and `lib/styles/legacy.css`). `/admin` has its own stylesheet.
- `/v2/…` redirects to the same path without the prefix.
