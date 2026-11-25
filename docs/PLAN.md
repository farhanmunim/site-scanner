# Site Scan — Product & Architecture Plan

**Status:** v1 built (Phase 1 + browser stage + free enrichment). This document is the condensed,
revised version of the original 180-section master plan. It keeps the principles, cuts the
multi-tenant SaaS scope, and adds what makes the tool "superpowered" and safe to run from a
personal VPS.

## 1. What it is

A public, free, no-login website scanner — WebAgencyHero + Wappalyzer + InspectWP in one —
where **anyone can look up any site** and **every lookup and result is stored privately for the
owner** in their own Postgres, browsable through an admin console.

Core philosophy (kept from the original plan): *don't just detect it, explain why you detected
it.* Every detection carries evidence and a confidence level; "unknown" and "not publicly
detectable" are first-class answers; CDN ≠ origin; no single made-up "website score".

## 2. What changed from the original plan and why

| Original | Revised | Why |
|---|---|---|
| Accounts, projects, teams, API keys, billing tiers | Owner-only `/admin` console; public tool needs no login | The requirement is one owner + anonymous public users |
| ~30 normalised tables | Versioned JSONB `report` + `gathered` per scan, plus 4 small indexed tables (lookups, scan_technologies, domains, blocklist) | Reports are re-analysable from raw data; facets stay queryable |
| Delete anonymous results after 24–48h | Keep reports indefinitely; screenshots 90 days; raw IPs 30 days then hash+country only; public privacy notice | Storing searches *is* the point |
| Hand-write 50–100 detectors | Run the open Wappalyzer-format DB (enthec/webappanalyzer, 7.6k technologies, GPL-3.0) through our own engine that records which pattern matched, plus an overrides file for managed hosts | Day-one coverage with evidence; we own the engine, not the signatures |
| Per-stage Redis jobs, 6 packages, separate browser container | One `scan` job; stages run as a concurrent in-process DAG; one worker image that includes Chromium; 2 packages | Right-sized for one VPS |
| Lighthouse locally | Google PageSpeed Insights API (free) for Lighthouse + CrUX field data + a screenshot; local Playwright for the real screenshot and rendered-DOM detection | Cheaper, better data |
| "Security audit" listed as goals | Concrete passive checks mapped to OWASP Top 10; **no** probing of sensitive paths; explicit target-safety policy in code with tests | Safety of the owner's IP/VPS is mandatory |

## 3. Non-negotiable safety rules (implemented in `packages/core/src/gather/policy.ts`, tested)

**Towards targets** — GET/HEAD only; fixed path allowlist (page + redirects, robots, sitemap,
security.txt, ads.txt, llms.txt, favicon, scripts the page references, and for WordPress the
theme `style.css` / plugin `readme.txt` / `/wp-json/` it references); ~25 requests per scan; 5
redirects; 512 KB HTML / 256 KB per file; no retries on 401/403/429/challenge and a one-hour
domain cool-down; never bypass bot protection; honest `SiteScanBot/1.0 (+/bot)` UA with an
opt-out form; denylist for `.gov/.mil/.nhs.uk/...`; external APIs cached and rate-respecting.

**Towards our own infrastructure** — every address is checked against private, loopback,
link-local, CGNAT, benchmark, multicast, IPv4-mapped/NAT64 ranges and the deployment's own IPs
before a socket opens (undici connect-time lookup → DNS rebinding safe); Chromium requests go
through the same check via route interception; ports limited to 80/443/8080/8443; the scanner
refuses its own hostnames; Postgres/Redis on the internal network only; Cloudflare in front with
Turnstile; a Cloudflare-only origin firewall; per-IP and per-domain rate limits; 15-minute cache;
in-flight dedupe; queue depth cap; container CPU/memory limits; admin kill switch; egress-IP
reputation links on the admin health page.

**Dropped on purpose:** `/.env`, `/.git`, backup and admin-path probing; any active payloads.
These are what attacker scanners do and what gets an IP blocklisted.

## 4. Architecture

```
Cloudflare (proxy, Turnstile, WAF rate limit)
   ↓ 443 (firewall: Cloudflare IPs only)
web  (SvelteKit adapter-node) ── Postgres ── worker (BullMQ; gather → analyse; Playwright)
        └── Redis (queue + rate-limit counters) ──┘         └── shared screenshots volume
```

- `packages/core/gather`: url normalise (IDN), SSRF guard, policy, safe fetch, DoH DNS + Team
  Cymru ASN + PTR, HTTP with manual redirect walking and challenge detection, files, RDAP via
  IANA bootstrap, TLS handshake (crt.sh fallback).
- `packages/core/analyze`: linkedom parse → fingerprint engine (headers, cookies, html, text,
  scriptSrc, script contents, meta, url, dns, dom, certIssuer, js globals, xhr; implies /
  requires / excludes; version capture) → infra roles (CDN, WAF, hosting via managed-host
  headers or ASN, DNS provider, email provider) → audits (security headers + CSP grading +
  cookies + SRI + mixed content + login exposure; SPF/DKIM/DMARC/MTA-STS/BIMI/CAA/DNSSEC; SEO,
  Open Graph, structured data, robots incl. AI-crawler rules, sitemap) → third parties →
  WordPress deep dive (core/theme/plugins/versions, outdated & abandoned via WordPress.org,
  advisories via Wordfence) / Shopify (theme, apps) → privacy signals → one `Report` object.
- `packages/core/external`: PSI, Safe Browsing, WordPress.org, Wordfence, Wayback, Green Web —
  all optional, all cached in Postgres.
- Worker persists after every stage; the report page streams progress over SSE and shows
  partial results. One stage failing never blanks the report.

## 5. Report sections

Overview · Technology (grouped by category, evidence drawer per item) · Infrastructure ·
Domain & DNS (registration, certificate, records) · Security (OWASP-tagged findings, cookies) ·
Email & DNS security · SEO (findings, metadata, robots, well-known files) · Performance &
accessibility (Lighthouse lab + CrUX field) · Privacy & third parties · CMS deep dive.

## 6. Admin console

Overview stats · Lookups feed (search by input/host/IP) · Scans (filter, re-scan, delete) ·
Technologies (leaderboard, "which sites use X", category facet, time window) · Domains
(cool-downs) · Blocklist (+ owner opt-outs) · Settings (kill switch, limits, stage toggles) ·
Health (workers, queue, DB size, egress IP reputation links).

## 7. Roadmap

- **Done (v1):** everything above.
- **Done (tool parity pass):** version-aware Wordfence matching (core, themes, plugins) + latest-core check; recursive SPF inspector (10-lookup budget, void lookups, loops); DNSBL checks of mail/web IPs; PHP version + end-of-life; multi-resolver DNS propagation; AI-readiness score; retire.js vulnerable JS libraries; exposed-secret patterns in delivered code; DANE/TLS-RPT; domain expiry/age/lock. Results live on `Report` (`php`, `aiReadiness`, `vulnerableLibraries`, `exposedSecrets`, `domainChecks`, `blocklists`, `propagation`, `cms.vulnerabilities`, `dns.spf`) and are shown in the new UI.
- **Done (UI redesign):** web-utility look built on the farhan.app UI library tokens; tool pages (`/tools/<slug>`) that show a focused view of the same scan; report with overview cards, section nav, SPF tree and propagation matrix.
- **Needs a key:** `WORDFENCE_API_KEY` (free, wordfence.com > Integrations) for WordPress vulnerability matching; the v2 feed was removed.
- **Deliberately not built:** exposed `.git`/`.env`/backup probing, port scanning, IIS probing and CORS probing (active; against the safety rules above); inbox tester (needs a mailbox).
- **Next:** history/diff between scans of the same domain
  ("what changed"); compare two sites; JSON export polish and a documented public API with keys;
  scheduled re-scans + webhooks for owner-chosen domains; MCP server exposing
  `analyse_website` / `get_technology_stack` / `get_changes`.
- **Later / optional:** AI summaries from the structured report (never from raw page content);
  PDF export from the same report object; CLI packaging.
