# SiteGuard

SiteGuard runs continuous, ownership verified security checks for websites built with Next.js and Supabase. The application uses Next.js 15, Supabase Auth/Postgres/Storage, Paddle Billing, Resend, and Vercel Cron. The user interface, email, and reports support English (`/en`) and Azerbaijani (`/az`).

## Local setup

1. Use Node.js 20.9 or newer. Install dependencies with `npm ci`.
2. Create a Supabase project. Copy `.env.example` to `.env.local` and replace every required example value. Keep `.env.local` outside version control.
3. In the Supabase SQL editor, apply **every** file in `supabase/migrations` in numeric order, `0001` through `0011`. Apply each file once and stop on errors. The migrations create schema, RLS, functions, Storage buckets, seed data, jobs, and release hardening. Use a fresh project or follow your normal reviewed migration process for an existing database.
4. Configure Supabase Auth and the external services below, then run `npm run dev`. Visit `/en` or `/az`.
5. Before deployment, run `npx tsc --noEmit` and `npx next build`.

The application never needs the Supabase service role key in a browser. Keep all server credentials in server-side environment variables only. Do not paste them into `NEXT_PUBLIC_*` variables.

## Supabase configuration

- Copy the project URL, publishable/anon key, and service role key into the matching environment variables. Use the same project for all three.
- In **Authentication → URL Configuration**, set the Site URL to `NEXT_PUBLIC_SITE_URL`. Add `https://YOUR_DOMAIN/en/auth/callback` and `https://YOUR_DOMAIN/az/auth/callback` as allowed redirect URLs. Add equivalent local URLs if using OAuth or email links locally.
- Enable email/password and email OTP/magic link. Require email confirmation. Configure the project email sender and auth email templates as appropriate. SiteGuard sends its own signup verification mail through Resend; Supabase still completes the confirmation exchange.
- Enable Google and GitHub in Supabase Auth. Register the OAuth redirect URL shown by Supabase with each provider and enter provider credentials in the Supabase dashboard. SiteGuard's app callback remains the two locale URLs above.
- Keep RLS enabled. Migration `0003_security.sql` enables it on initial public tables; `0010_delivery_exports.sql` enables it on the later delivery table. Storage policies are in `0004_storage.sql` and tightened by `0011_release_hardening.sql`. Client roles have no write access to billing, scan jobs, secrets, or rate limits.
- Storage buckets are created by migration: private `report-pdfs`, `data-exports`, `white-label-logos`, and public `avatars`. Confirm bucket settings and policies after migration.

### First administrator

Sign up and verify the intended administrator first. Then, in the **Supabase SQL editor as the project owner**, run this SQL with the real email address:

```sql
begin;
update public.profiles
set role = 'admin'
where id = (select id from auth.users where lower(email) = lower('admin@example.com'))
returning id, email, role;
commit;
```

Confirm exactly one row was returned. Admin access is checked in server code and by the `is_admin()` database function. Do not expose a client-facing path to change `profiles.role`.

## Paddle Billing

Create three products/plans with monthly and annual EUR prices matching `lib/plans.ts`: Starter €12/€120, Pro €39/€390, Agency €99/€990. Set the six `PADDLE_PRICE_*` variables to the corresponding **price IDs**. Set `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_ENVIRONMENT`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, and `NEXT_PUBLIC_PADDLE_ENVIRONMENT` for the same sandbox or production environment.

Register `https://YOUR_DOMAIN/api/webhooks/paddle` as the webhook endpoint. Subscribe to subscription created, updated, canceled, past due, paused, resumed, and transaction completed/payment failed/past due events. The handler verifies Paddle's signature against the raw body, deduplicates by event ID in `billing_events`, fetches current subscription state from Paddle, and updates entitlements. Configure Paddle's checkout/domain settings, tax and merchant details, and customer portal in the Paddle dashboard. Invoices in SiteGuard link to Paddle's invoice PDF after checking ownership.

## Resend and optional Turnstile

Verify the sending domain in Resend and set `RESEND_API_KEY` and `EMAIL_FROM` to a sender on that domain. Confirm SPF, DKIM, and DMARC, and test delivery to both locales. Essential billing mail and opt-out behavior are handled separately from marketing preferences.

Turnstile is optional. To enable it, create a Cloudflare Turnstile widget for the deployed hostname and set **both** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`. Leave both empty to disable it. Verify signup, sign-in, password recovery, contact, and public passive-check flows after enabling it.

## Environment variables

The authoritative template is `.env.example`; `lib/public-env.ts` validates browser-safe values and `lib/env.ts` validates server values at runtime. Values without `NEXT_PUBLIC_` must stay server-side.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical HTTPS origin used for callbacks, links, and same-origin checks. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anon key. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional browser widget key. |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | Paddle browser client token. |
| `NEXT_PUBLIC_PADDLE_ENVIRONMENT` | `sandbox` or `production`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only database/admin key. |
| `CRON_SECRET` | Random secret of at least 32 characters; Vercel sends it as `Authorization: Bearer …`. |
| `ENCRYPTION_MASTER_KEY` | Base64 encoding of exactly 32 random bytes for AES-256-GCM. Back it up securely. |
| `ENCRYPTION_KEY_VERSION` | Positive integer version for new encrypted rows. |
| `ENCRYPTION_PREVIOUS_KEYS` | Optional JSON object mapping old key versions to base64 keys during rotation. |
| `RESEND_API_KEY` | Resend server API key. |
| `EMAIL_FROM` | Verified Resend sender address/name. |
| `PADDLE_API_KEY` | Paddle server API key. |
| `PADDLE_WEBHOOK_SECRET` | Webhook endpoint signing secret. |
| `PADDLE_ENVIRONMENT` | Paddle server `sandbox` or `production`. |
| `PADDLE_PRICE_STARTER_MONTHLY` | Starter monthly Paddle price ID. |
| `PADDLE_PRICE_STARTER_ANNUAL` | Starter annual Paddle price ID. |
| `PADDLE_PRICE_PRO_MONTHLY` | Pro monthly Paddle price ID. |
| `PADDLE_PRICE_PRO_ANNUAL` | Pro annual Paddle price ID. |
| `PADDLE_PRICE_AGENCY_MONTHLY` | Agency monthly Paddle price ID. |
| `PADDLE_PRICE_AGENCY_ANNUAL` | Agency annual Paddle price ID. |
| `TURNSTILE_SECRET_KEY` | Optional Turnstile server verification key. |
| `COMPANY_LEGAL_NAME` | Legal entity name shown on legal pages. |
| `COMPANY_ADDRESS` | Company postal address shown on legal pages. |
| `COMPANY_EMAIL` | Legal/contact email shown on legal pages. |
| `COMPANY_REGISTRATION_NUMBER` | Optional registration number. |
| `COMPANY_VAT_NUMBER` | Optional VAT number. |
| `MAINTENANCE_MODE` | Emergency override, `true` or `false`. |
| `LOG_LEVEL` | `debug`, `info`, `warn`, or `error`; logger redacts values. |

Key rotation: increase `ENCRYPTION_KEY_VERSION`, install a new master key, and put the previous version/key in `ENCRYPTION_PREVIOUS_KEYS` until all existing encrypted values have been re-encrypted. Losing an old key makes its stored secrets unreadable. Never log or commit any key.

## Vercel deployment and jobs

Import the repository into Vercel, select the Next.js framework, and set the production environment variables. Set the canonical domain and `NEXT_PUBLIC_SITE_URL` to the same HTTPS origin. The `vercel.json` cron schedule is UTC:

| Route | Schedule | Work |
| --- | --- | --- |
| `/api/cron/scan-enqueue` | Hourly at minute 0 | Queue due site scans. |
| `/api/cron/scan-worker` | Every minute | Recover and process small leased scan steps. |
| `/api/cron/notifications` | Every minute | Send queued email and alert deliveries. |
| `/api/cron/exports` | Every minute | Generate queued reports and account exports. |
| `/api/cron/reverify` | Daily 03:00 | Recheck ownership challenges. |
| `/api/cron/trial-reminders` | Daily 08:00 | Queue trial reminder and expiry mail. |
| `/api/cron/retention` | Daily 04:00 | Purge expired scans and export files. |

Each route requires `Authorization: Bearer <CRON_SECRET>` and has an explicit `maxDuration`. Confirm the selected Vercel plan supports the configured frequency and duration. The worker claims jobs with `FOR UPDATE SKIP LOCKED`; do not replace the cron routes with a long-running server.

## Pre-launch manual checklist

- [ ] Apply migrations `0001`–`0011` to the intended Supabase project and confirm each succeeded. Inspect RLS and Storage policies in Supabase, including suspended-account write denial.
- [ ] Replace the example legal entity, address, contact email, registration/VAT details, and review the Terms, Privacy, AUP, cookie notice, sub-processors, and DPA wording with counsel.
- [ ] Confirm production keys and Paddle price IDs belong to the production accounts, and that no server key appears in a `NEXT_PUBLIC_*` variable or browser bundle.
- [ ] Verify Google/GitHub OAuth, password signup, email verification, magic link, reset password, session refresh, and locale-specific callbacks on the production domain.
- [ ] Create the first admin with the SQL above. Confirm a normal account cannot view `/admin`, change its role/trial/plan, or read another user's sites, scans, findings, exports, links, or billing data.
- [ ] Run Paddle sandbox/production test transactions, plan changes, cancellation/resumption, invoice access, failed payment, webhook replay, and event deduplication. Confirm site limits and read-only transitions.
- [ ] Verify Resend domain authentication and EN/AZ email delivery, unsubscribe, notifications, and webhook signatures. If Turnstile is enabled, verify the live hostname and actions.
- [ ] Verify each ownership method against a domain you control. Confirm an unverified site gets only passive checks, private/metadata IPs are blocked, redirects are revalidated, and no scan changes customer data.
- [ ] Trigger each cron route with the configured secret in a controlled environment; confirm queue progress, retries, stuck-job recovery, retention, and export download expiry. Confirm unauthenticated cron requests fail.
- [ ] Check EN/AZ pages, mobile layouts, keyboard navigation, reduced-motion behavior, sitemap/robots, social images, custom errors, CSP, and cookies in deployed responses.
- [ ] Confirm Vercel cron frequency/function duration limits and monitor logs, failed jobs, billing events, and deliverability after launch.

Do not treat a successful local build as proof that external providers or production RLS are configured correctly; those checks require the deployed accounts and a real Supabase project.
