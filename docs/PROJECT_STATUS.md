# Nafah Agro Project Status

Last updated: 2026-08-21

## Summary

Milestones 1–6 are complete in local code. The V1 includes Supabase Auth with
OWNER/CUSTOMER profiles and shared email password recovery, PostgreSQL/Prisma
catalog and FIFO inventory, physical
and delivery sales, whole delivery-order returns, identified physical-sale item
returns, OWNER analytics, Cloudinary uploads,
and a single-project Vercel layout. No deployment, external migration, or
production-data change was performed during the final review.

The code is ready for a disposable Supabase/Vercel Preview acceptance run. It
is not approved for production until the external gates in this document and
`docs/RELEASE_CHECKLIST.md` are completed.

## Milestone 6 completed in code

- Added shared OWNER/CUSTOMER password recovery through Supabase email links.
- Added OWNER-controlled promotion for an email already registered as CUSTOMER.
  It preserves the Auth identity, password, profile, active state, customer
  orders, and audit history. Safe demotion is available only before owner-side
  activity; promoted identities cannot be deleted as unused invitations.
  Recovery sessions bypass application-profile loading without bypassing profile
  activation rules, clear pending owner-invite password metadata, sign out after
  success, and cannot be opened from an ordinary signed-in application session.
- Replaced the subtle invited-owner password action with a mandatory activation
  screen. Pending owners see only password setup and logout, cannot enter profile
  or management workflows, and go directly to the dashboard after activation.
- Simplified catalog option management for the small-business workflow: the UI
  uses `প্যাক/সাইজ`, accepts an optional initial option name, hides internal
  default names, and no longer exposes or accepts manual SKU values. Express
  generates immutable internal SKUs; existing schema and historical data remain unchanged.
- Added separate packaged, loose-weight, and loose-volume product types. Loose
  products keep one hidden internal option, are physical-shop-only, store exact
  gram/millilitre stock, and use per-kg/per-litre FIFO rates. Public and manual
  delivery-order APIs reject them, while owner inventory, physical sales,
  returns, alerts, valuation, and analytics preserve their quantity units.
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
- Added protected deletion for another owner only when no operational or audit
  references exist; used accounts remain deactivation-only and self-deletion is blocked.
- Added OWNER-only permanent deletion for empty categories and products without
  inventory, adjustment, order, or selling-price update history. Eligibility is calculated and
  rechecked by the API; used records remain deactivate-only. Setup variants and
  price history are deleted transactionally, while Cloudinary files remain for
  manual orphan review.
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
  chart axes, a calendar-year preset, and client-side range validation. Preset
  buttons now populate always-visible editable start/end dates; manual edits use
  the same controls, and one-day ranges omit the unhelpful trend graph.
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

## Verification on 2026-08-22

- `npm run typecheck`: passed (frontend, backend, Prisma scripts).
- `npm run lint`: passed with no errors or warnings.
- `npm test -- --run`: 281 tests passed across 38 files. This includes analytics
  recognition/reversal/FIFO/discount/source/ranking/inventory cases, auth claims,
  OWNER/CUSTOMER access, strict request contracts, upload limits, safe errors,
  database-integrity source checks, unused owner/catalog deletion safeguards,
  customer-to-owner role transitions, and dialog request behavior.
- `npm run build`: passed. The public entry chunk is 561.14 kB
  (162.60 kB gzip). OWNER analytics remains lazy at 435.36 kB (121.29 kB gzip).
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

## Identified physical-sale returns

- Added OWNER-only search of completed physical sales by product, phone, sale
  number, exact total, and inclusive Dhaka date range.
- Added item/quantity returns tied to the original sale and FIFO allocations.
  SELLABLE restores the returned amount at the original buying cost; DAMAGED
  restores no stock. A required reason and append-only audit record are stored.
- Refund, reversed buying cost, and reversed profit use the original captured
  line discount and allocation snapshots. Row locking and cumulative checks
  prevent excess or repeated returns.
- Delivery orders retain the existing whole-order return workflow. Returns that
  cannot be linked to an original physical sale remain explicitly deferred.
- Migration `202608150004_physical_sale_item_returns` is checked in but must be
  deployed before this feature is used against Supabase.
- Local TypeScript, lint, Prisma validation/generation, frontend/backend builds,
  and `git diff --check` passed. The full suite passed 238 tests across 34 files.
  The migration was not applied to Supabase during this task.

## Loose-product verification on 2026-08-15

- `npm run typecheck`: passed for frontend, backend, and Prisma scripts.
- `npm run lint`: passed with no errors or warnings.
- `npm test -- --run`: 222 tests passed across 32 files, including exact
  kg/g and litre/ml conversion, measured FIFO cost/sales, incompatible-channel
  rejection, unit snapshots, separated analytics, and migration-source checks.
- `npm run build` and `npm run build:server`: passed. Vite retains the accepted
  shared-chunk size warning.
- `npm run prisma:validate` and `npm run prisma:generate`: passed.
- `npm run inventory:check`: passed against the configured database with no
  cached stock-total mismatches.
- `prisma migrate status` connected successfully and reported
  `202608080002_unused_catalog_deletion` and
  `202608150001_loose_products` as pending. No migration was applied by this
  implementation task; deploy both before using loose products in that database.
- `git diff --check`: passed.

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
