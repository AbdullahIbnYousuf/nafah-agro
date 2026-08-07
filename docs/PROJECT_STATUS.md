# Nafah Agro Project Status

Last updated: 2026-08-07

## Summary

Milestones 1–6 are complete in local code. The V1 includes Supabase Auth with
OWNER/CUSTOMER profiles, PostgreSQL/Prisma catalog and FIFO inventory, physical
and delivery sales, whole-order returns, OWNER analytics, Cloudinary uploads,
and a single-project Vercel layout. No deployment, external migration, or
production-data change was performed during the final review.

The code is ready for a disposable Supabase/Vercel Preview acceptance run. It
is not approved for production until the external gates in this document and
`docs/RELEASE_CHECKLIST.md` are completed.

## Milestone 6 completed in code

- Removed active obsolete deployment/auth references and all native
  `alert`/`prompt`/`confirm` workflows. Order transitions, returns, delivery-rate
  edits, category edits, and loss warnings now use application dialogs with
  explicit consequences and in-context validation errors.
- Added strict catalog request schemas and contract tests that reject unknown or
  client-supplied role, buying-cost, price-total, discount-total, and profit data.
- Verified Supabase tokens cryptographically for issuer, audience, expiry, and
  subject before resolving an active PostgreSQL profile and role.
- Kept every management mutation OWNER-only. Public delivery-rate responses now
  expose active customer-facing fields only; the complete rate view is OWNER-only.
- Hardened uploads to OWNER-only JPEG/PNG/WebP/AVIF files, 5 MB per file and ten
  files per request, using a fixed `nafah-agro` Cloudinary folder and safe errors.
- Production 500 responses now hide database codes, details, messages, and stacks.
  Helmet, JSON-size limits, request IDs, same-origin production CORS, website
  idempotency, and owner-invitation/protected-route limits remain enabled.
- Documented that the in-memory rate limiter is a per-Function-instance abuse
  brake, not a global Vercel quota; Vercel WAF rules are the preferred V1
  production mitigation.
- Added a migration that checks cached variant totals before installation, then
  enforces deferred batch/variant total consistency, allocation state/timestamp
  consistency, immutable batch-to-variant identity, and reasons for cancelled,
  failed-delivery, and returned records.
- Added read-only `npm run inventory:check`. The configured database reported
  `consistent: true` with no mismatches on 2026-08-04. The new migration itself
  was not applied externally.
- Audited `npm run seed`: it remains idempotent and non-destructive. Destructive
  sample-data reset remains a separate command requiring the explicit
  `CONFIRM_DEMO_RESET=RESET_NAFAH_AGRO_DEMO` acknowledgement.
- Added a separately confirmed, non-destructive dashboard demo refresh that
  moves only three known demo-order timestamps into the current reporting period.
- Improved OWNER analytics with full Bangla Gregorian month names, full numeric
  chart axes, a calendar-year preset, and client-side custom-range validation.
- Removed unnecessary read-only Prisma transactions from catalog/order lists,
  avoiding transaction-start failures under concurrent page loads. Stock and
  order writes retain their transactional guarantees.
- Lazy-loaded every frontend route and major OWNER section. Recharts and
  TanStack Query remain in the OWNER analytics chunk, outside the initial public
  route. Product images use lazy decoding/loading where appropriate.
- Added mobile/table/desktop Playwright coverage, improved footer touch targets,
  standardized missing-page Bangla copy, and added field-level errors to manual
  orders and physical sales.
- Added concise deployment, operations, recovery, backup, incident, demo, and
  release documentation. Cloudinary records still store secure URLs rather than
  public IDs, so orphaned remote uploads require manual review.

## Verification on 2026-08-04

- `npm run typecheck`: passed (frontend, backend, Prisma scripts).
- `npm run lint`: passed with no errors or warnings.
- `npm test -- --run`: 165 tests passed across 22 files. This includes analytics
  recognition/reversal/FIFO/discount/source/ranking/inventory cases, auth claims,
  OWNER/CUSTOMER access, strict request contracts, upload limits, safe errors,
  database-integrity source checks, and dialog request behavior.
- `npm run build`: passed. The public entry chunk changed from 781.38 kB
  (222.94 kB gzip) to 552.22 kB (160.21 kB gzip), a 29.3% raw and 28.1% gzip
  reduction. OWNER analytics remains lazy at 433.87 kB (120.56 kB gzip).
- `npm run build:server`: passed.
- `npm run prisma:validate`: passed.
- `npm run prisma:generate`: passed.
- `npm run inventory:check`: passed against the configured database with no
  cached stock-total mismatches.
- `git diff --check`: passed.
- Playwright with system Chrome: two responsive scenarios passed at 390x844,
  768x1024, and 1440x900, covering storefront/product/cart and all OWNER tabs;
  no page overflow, undersized visible mobile controls, or console errors were
  detected. The Codex in-app browser was unavailable, so system Chrome was used.
- The production build reports a local-only Vite warning because this workspace's
  untracked `.env` sets `NODE_ENV=production`; remove it or set `development` for
  local work. Vercel sets production mode during deployment.

## Environment contract

Vercel runtime/build variables:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_JWT_AUDIENCE`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `JSON_BODY_LIMIT` only when overriding the safe default
- `SUPABASE_SERVICE_ROLE_KEY` (backend-only; required for production OWNER invitations)

`DIRECT_URL` belongs in protected local migration/CI configuration, not the
normal Vercel runtime. Obsolete MongoDB, custom-JWT, admin-unlock,
cross-origin-frontend, and separate-backend variables are not used.

## External acceptance required

- Create or select a disposable Supabase project, take a backup, apply every
  checked-in Prisma migration, run the safe seed, and rerun the inventory check.
- Verify Supabase Site URL/redirects for localhost, production, and Preview;
  test registration/profile trigger, login refresh, password recovery, SMTP,
  OWNER invitation, and at least two MFA-protected OWNER identities.
- Configure a Vercel Preview with the required secrets; verify Function detection,
  `/`, `/shop`, `/admin`, product refreshes, health, JSON API 404s, PostgreSQL,
  logs/request IDs, and rollback to a known-good deployment.
- Perform a real authorized Cloudinary upload and render, plus invalid MIME,
  oversize, over-count, and CUSTOMER-denial checks.
- Enter client-approved Dhaka and Outside-Dhaka charges, approved opening stock
  and costs, and verify one concurrent final-stock confirmation.
- Reconcile live dashboard totals against known physical/delivered/returned
  orders. Deterministic automated reconciliation is complete; real staging data
  is still required.
- Complete a Supabase backup restore drill and approve account ownership,
  contact email, legal/privacy/return copy, product content, registration policy,
  and production incident contacts.

## Accepted V1 residuals

- In-memory rate limits are not shared across Vercel instances.
- Remote Cloudinary orphan cleanup is manual because public IDs are not stored.
- Generated UI dependencies remain in the repository but are tree-shaken from
  routes that do not use them; no risky dependency/framework migration was made.
- React Router prints v7 future-option notices in test stderr; current v6 behavior
  is correct and upgrading is deferred.
- Bundle tooling still warns that the shared public chunk exceeds 500 kB raw;
  route/OWNER code splitting is working and further dependency changes should be
  evidence-driven rather than a release blocker.
