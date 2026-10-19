You are a senior full-stack engineer and product designer. Build a COMPLETE, PRODUCTION-READY SaaS product. This is NOT a demo, prototype, or boilerplate: no mock data, no placeholder features, no "TODO", no fake buttons. Every feature described below must be fully implemented and wired end-to-end. Output the entire codebase file by file, then STOP.





PRODUCT

Name: "SiteGuard" (brand name must be a single constant in config, easy to change).

Tagline: Continuous security audits for small teams who can't afford enterprise tools.

What it does: Users add their websites/apps, verify ownership, and the platform runs automated security audits, produces a plain-language report with a 0-100 score, prioritized findings, and copy-paste fixes, and monitors continuously with alerts.

Primary audience (v1): Next.js + Supabase startups, indie hackers, agencies. The scanner must be built around an extensible "check module" architecture (/lib/scanner/modules/\*) so a Shopify/E-commerce module and a WordPress module can be added later without refactoring. Implement only the Supabase/Next.js module now.



TECH STACK (fixed)

\- Next.js 15 (App Router), TypeScript strict, React Server Components where sensible, Server Actions + Route Handlers

\- Tailwind CSS + shadcn/ui + lucide-react + framer-motion (subtle only)

\- Supabase: Postgres, Auth, Storage, RLS. Use @supabase/ssr. Provide full SQL migrations in /supabase/migrations (tables, indexes, RLS policies, triggers, functions, enums, storage buckets)

\- Zod for all input validation

\- next-intl for i18n

\- Resend for transactional email (React Email templates)

\- Paddle Billing for subscriptions (abstract behind a BillingProvider interface in /lib/billing)

\- Background work: Vercel Cron Jobs hitting protected route handlers + a Postgres-backed job queue (scan\_jobs table, claimed with FOR UPDATE SKIP LOCKED). Scans must be chunked so every serverless invocation finishes well inside Vercel function limits (set maxDuration explicitly, process in small steps, resume from persisted state).

\- PDF reports: server-side generation with @react-pdf/renderer

\- Deployed on Vercel. Include vercel.json (crons, headers), next.config.ts, middleware.ts, .env.example. No Docker, no long-running servers, nothing that doesn't work on Vercel serverless.



INTERNATIONALIZATION

\- Entire site, dashboard, admin, emails, reports and PDFs in English by default, with full Azerbaijani (az) translation.

\- Language switcher in the top navigation (EN | AZ) on marketing pages, auth pages, dashboard and admin. Choice persisted in a cookie and in the user profile (profiles.locale). Use next-intl with locale-prefixed routes (/en, /az) and correct hreflang/SEO metadata.

\- Every user-facing string lives in /messages/en.json and /messages/az.json. Write complete, natural Azerbaijani (not machine-literal). Scan findings, fix guides and email templates must be translated too (store finding definitions as translation keys).



DESIGN (premium, elegant, "$30-40k agency" quality)

\- Refined, minimal, confident. Light and dark mode (system default + toggle). Generous whitespace, strong typographic hierarchy (e.g. Inter or Geist for UI, a refined display face for headlines), subtle gradients, soft shadows, 1px borders, smooth micro-interactions, skeleton loaders, beautiful empty states, polished toasts.

\- Fully responsive, mobile-first, accessible (WCAG AA, keyboard navigation, focus rings, aria labels, prefers-reduced-motion).

\- Marketing site pages: Home (hero, animated product preview built from real components, how it works, features, a live "paste your URL for a free passive check" widget, pricing, FAQ, final CTA), Pricing (monthly/annual toggle, comparison table), Features, How it works, Security (our own security practices), Blog-less but with a Changelog page, Contact, Terms of Service, Privacy Policy, Acceptable Use Policy, Cookie notice. Legal pages must be complete, professionally worded drafts, with company details pulled from env/config.

\- Custom 404, 500, maintenance and not-authorized pages. Favicon, OG images (dynamic via next/og), sitemap.xml, robots.txt, JSON-LD.



AUTHENTICATION \& ACCOUNTS

\- Supabase Auth: email+password, magic link, Google and GitHub OAuth. Email verification required. Forgot/reset password. Secure session handling via middleware.

\- Onboarding flow: welcome → add first site → verify ownership → first scan.

\- Account settings: profile, locale, change email/password, notification preferences, API keys (create/revoke, hashed at rest, shown once), connected sessions, delete account (full data deletion with confirmation).

\- Roles: user, admin (profiles.role). Admin access enforced server-side AND by RLS, never by client checks.



PLANS, PRICING \& TRIAL (all must be fully enforced in code)

\- Every new account gets a 3-day free trial with Pro-plan features, no credit card required. Trial status is tracked in the database; trial countdown banner in the dashboard; reminder emails at day 2 and at expiry. After trial ends without a subscription, the account becomes read-only (can view past reports, cannot add sites or run scans) with a clear upgrade prompt. One trial per account; basic abuse prevention (block disposable email domains list, one trial per verified email).

\- Prices (EUR, monthly / annual with 2 months free):

&#x20; 1. Starter — €12/mo (€120/yr): 1 site, weekly automatic scans, 3 manual scans/month, email alerts, 30-day history, standard fix guides, public shareable score link.

&#x20; 2. Pro — €39/mo (€390/yr): 5 sites, daily automatic scans, unlimited manual scans (fair-use rate limit), Slack/Discord/webhook alerts, ready-to-paste SQL \& code fixes generated from the actual findings, PDF reports, score badge (SVG) for README/website, 90-day history, scan comparison/diff, priority email support.

&#x20; 3. Agency — €99/mo (€990/yr): 25 sites, daily scans + on-demand priority queue, white-label PDF reports (custom logo, name, color), up to 5 team members with roles (owner/member/viewer), client-grouped workspaces, full REST API + CI/CD endpoint (a ready-to-use GitHub Action snippet that fails the build if score/critical findings cross a threshold), 365-day history, CSV/JSON export, priority support.

\- Centralize all plan definitions and entitlements in ONE typed config (/lib/plans.ts) and enforce limits in server code and in database constraints/functions (site count, scan frequency, team seats, features). Show usage meters in the dashboard. Upgrade/downgrade/cancel/resume via Paddle customer portal + in-app flows, with proration handled by Paddle. Handle webhooks (subscription created/updated/canceled/past\_due/paused, transaction completed/failed) idempotently with signature verification, an events table for deduplication, and dunning emails. Downgrades must gracefully handle sites above the new limit (mark extra sites as paused, never delete data).

\- Paddle handles VAT as merchant of record; still collect billing country for display. Invoices accessible from the billing page.



SITES \& OWNERSHIP VERIFICATION (legally critical)

\- Users add a site by URL. Normalize and validate it. A site can be scanned deeply ONLY after ownership is verified via one of: DNS TXT record, meta tag, or a file at /.well-known/siteguard-verification.txt. Provide clear UI instructions per method, a "Verify now" button, and automatic re-checks.

\- Unverified sites get passive checks only (headers, TLS, publicly visible info). Never perform active Supabase probing on unverified sites.

\- Re-verify ownership periodically (every 30 days); if it fails, pause deep scans and notify the user.

\- A global blocked-domains list (admin-managed) prevents scanning sensitive targets (government, banks, big platforms, localhost, etc.) and prevents the same domain being verified by multiple accounts simultaneously.



SCANNER (must be professional, accurate, and safe)

Architecture: /lib/scanner with a module interface { id, name, run(context) → Finding\[] }, a job runner, shared HTTP client with strict SSRF protection, timeouts, size limits, and a central finding registry (id, severity, CVSS-like score weight, title/description/impact/fix translation keys, references).

Severity: Critical / High / Medium / Low / Info. Score = 100 minus weighted penalties with diminishing returns, deterministic and documented in the Security/How-it-works page.



Supabase / Next.js module (verified sites; deep checks):

1\. Discover Supabase project URL and anon key from the site's public JS bundles/HTML (parse \_next static chunks, env leaks). Allow the user to alternatively provide them manually.

2\. Detect a leaked service\_role key (decode JWT, check role claim) in public assets → Critical.

3\. Enumerate exposed tables via PostgREST OpenAPI schema using the anon key. For each table test anonymous SELECT using the minimal safe request (limit=1, count only). NEVER store or display row contents; store only table name, column names, and whether data was readable (and a row-count estimate if available). Flag sensitive-looking tables/columns (users, profiles, emails, tokens, payments, orders, etc.).

4\. Write-access checks (INSERT/UPDATE/DELETE for anon) must be strictly non-destructive. Use only methods that cannot modify data; if safe determination is impossible, report "Requires manual verification" with instructions instead of guessing. Never create, modify or delete customer data. Optional advanced mode: user supplies a test-account email/password for their own app to test authenticated cross-user access (credentials encrypted, never logged).

5\. Exposed RPC/SQL functions callable by anon (from OpenAPI), especially suspicious names.

6\. Storage: publicly listable buckets, public buckets with sensitive-looking paths (list names only, never download contents).

7\. Auth configuration via /auth/v1/settings: open signups, auto-confirm, enabled providers, weak settings.

8\. Next.js specifics: exposed source maps, leaked environment variables in client bundles, unauthenticated common API routes, exposed /\_next data endpoints, known-vulnerable Next.js version fingerprint (maintain a versioned advisory list in the repo), missing middleware auth patterns detectable from outside.

9\. General web hygiene: TLS/cert validity and expiry, HSTS, CSP, X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, cookie flags (Secure/HttpOnly/SameSite), CORS misconfiguration (wildcard with credentials, reflected origins), exposed /.env, /.git, backup files, directory listings, open redirects on common params, security.txt, mixed content, third-party script inventory with SRI check.

Each finding includes: evidence (sanitized), affected asset, why it matters (plain language, no jargon), exact fix steps, and for Pro+ plans generated copy-paste SQL (e.g. ENABLE ROW LEVEL SECURITY + sensible policy templates using the real table/column names) and Next.js code/header snippets.

Scan features: scan history, per-finding status (open / fixed / ignored with reason / accepted risk), automatic "resolved" detection on re-scan, diff between scans, regression alerts, shareable public report links (random unguessable token, revocable, redacted of sensitive evidence), score badge SVG endpoint, PDF export, CSV/JSON export.

Scheduling: Vercel Cron enqueues due scans based on plan frequency; a worker cron processes the queue. Handle retries, backoff, stuck-job recovery, concurrency limits per user and globally.



NOTIFICATIONS

\- Email (Resend) for: verification, welcome, trial reminders, scan completed, new critical/high finding, score regression, ownership re-verification failed, payment failed, subscription changes. Per-user preferences + one-click unsubscribe for non-essential mail.

\- Slack, Discord and generic signed webhooks (Pro+). In-app notification center with unread counts.



USER DASHBOARD

Overview (score trends chart, open findings by severity, upcoming scans, usage vs plan), Sites list, Site detail (score history, findings table with filters/search/sorting, scan timeline, verification status, settings), Finding detail drawer with fix guide, Reports, Notifications, Team (Agency), API keys, Billing, Settings. Command palette (Cmd+K). Keyboard friendly. Real-time scan progress via Supabase Realtime or polling.



ADMIN PANEL (/admin, admin-only, fully functional)

\- Dashboard: MRR, active subscriptions by plan, trials started/converted, churn, signups, scans per day, queue depth, failure rate, charts.

\- Users: search, view profile, plan, trial, sites, scans; extend/end trial, grant/revoke plan override, suspend/unsuspend, force email verify, delete user. 

\- Subscriptions \& billing events viewer (webhook log with replay).

\- Sites \& scans: browse all, inspect scan jobs, requeue/cancel, view errors.

\- Blocked domains manager, abuse reports inbox, contact-form messages inbox with status.

\- Content: announcements banner manager, changelog entries editor (translated EN/AZ).

\- System: feature flags, maintenance mode toggle, global settings, audit log of every admin action (who, what, when, IP), export CSV.

\- Every admin mutation is server-side authorized, validated and audit-logged.



SECURITY REQUIREMENTS (the product itself must be hardened)

\- RLS enabled on every table with explicit least-privilege policies; users can only access their own/team data. The service role key is used ONLY in server-only modules (import 'server-only'), never exposed to the client.

\- Strict SSRF protection for the scanner: only http/https, ports 80/443, resolve DNS and block private/loopback/link-local/metadata IP ranges (IPv4 and IPv6), pin the resolved IP for the request to prevent DNS rebinding, limit redirects and re-validate each hop, response size/time caps, no credentials forwarded.

\- Encrypt sensitive stored values (user-supplied keys/test credentials) with AES-256-GCM using an env master key, with key versioning. Hash API keys (SHA-256 with prefix lookup). Never log secrets or customer data.

\- Zod validation on every input; centralized authorization helpers; CSRF-safe Server Actions; rate limiting implemented in Postgres (sliding window function) for auth, scan triggers, contact form, public widget and API; Cloudflare Turnstile support on public forms (optional via env).

\- Security headers and a strict nonce-based CSP via middleware, HSTS, frame-ancestors none, Referrer-Policy, Permissions-Policy. Secure cookies. Cron endpoints protected by CRON\_SECRET. Webhooks verified by signature. Idempotency everywhere money or scans are involved.

\- GDPR: data export, account deletion, data retention job (purge old scans per plan), cookie consent only for non-essential cookies, DPA/sub-processor list on the Privacy page.

\- Safe error handling: generic errors to users, structured server logs without secrets.



PUBLIC API (Pro limited / Agency full)

Versioned REST at /api/v1 authenticated with API keys: list sites, trigger scan, get scan status/findings, get score, export. Consistent JSON errors, rate limit headers, OpenAPI document served at /api/v1/openapi.json and a polished docs page at /docs. Include the GitHub Action example.



CODE QUALITY

\- Clean folder structure, strongly typed, small focused modules, shared UI components, no dead code, no console.log of sensitive data, consistent error handling, meaningful comments only where non-obvious. Server-only code clearly separated. Environment variables validated at startup with Zod (/lib/env.ts).

\- SQL migrations are ordered, idempotent-safe, include seed of plan config reference data and required storage buckets/policies, and database functions for entitlement checks and queue claiming.



DELIVERABLES (output in this order, all files complete)

1\. Project tree

2\. /supabase/migrations/\*.sql

3\. Config files (package.json with exact dependencies, tsconfig, next.config.ts, tailwind config, middleware.ts, vercel.json, .env.example)

4\. /lib (env, supabase clients, plans, billing, scanner, crypto, ssrf, rate-limit, email, i18n, utils)

5\. /app (marketing, auth, dashboard, admin, api routes, cron routes, webhooks)

6\. /components, /emails, /messages/en.json, /messages/az.json

7\. README.md and the environment variable list

Then stop. Do not test, do not run, do not summarize beyond that.

