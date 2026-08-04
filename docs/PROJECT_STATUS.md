# Nafah Agro Project Status

Last updated: 2026-08-04

## Summary

Milestones 1–5 are complete in local code. The OWNER analytics dashboard now
uses PostgreSQL order snapshots, FIFO allocations, batches, and variant totals.
A read-only authenticated smoke test succeeded against the configured sample
database; the new migration, deployment, and production-data reconciliation
were not performed. The existing single-project Vercel architecture is unchanged.

## Completed in code

- Supabase Auth, active PostgreSQL profiles, OWNER/CUSTOMER authorization,
  strict environment validation, Express security/rate limits, and health checks.
- PostgreSQL categories, products, variants, unique SKUs, current price, immutable
  price history, purchases, stock batches, reason-required adjustments, FIFO
  allocations, variant stock totals, and immediate physical-shop sales.
- Unified `SalesOrder`, `SalesOrderItem`, and `OrderAllocation` support WEBSITE,
  PHYSICAL_SHOP, FACEBOOK, PHONE, WHATSAPP, and OTHER.
- Guest website COD sends no financial fields, is idempotent, and starts pending
  without reservation. Authenticated checkout attaches the verified profile.
- OWNER confirmation reserves exact FIFO batches in a serializable
  transaction; insufficient/concurrently changed stock rejects the operation.
- Manual delivery orders can start pending or confirmed. Delivery consumes
  reservations and marks COD paid. Cancellation/failed delivery releases stock
  and records a reason without recognized revenue/profit.
- Whole sellable returns restore stock using original allocation quantities and
  costs; damaged returns restore no stock. Return status is the reporting reversal
  signal and original commercial/cost snapshots remain preserved.
- Editable `delivery_rates` contains Dhaka and Outside Dhaka. Seeded charges are
  deliberately `NULL` pending client approval; checkout rejects an unpriced rate.
- Sensitive order/rate mutations append actor, before/after state, and reason to
  database-enforced append-only `audit_logs` in the same transaction.
- Storefront cart, customer website-order history, and unified admin management
  use `/api/v1`. Fake coupons and online/card/mobile-payment choices are removed.
- Product pages use sellable variants as the only package/weight selector, so
  the selected label, SKU, price, stock identity, and cart item cannot diverge.
- Mongo startup, Mongoose dependency/model, `/api/orders`, Mongo utility, and
  `MONGO_URI` have been removed.
- A single-project Vercel layout is prepared: Vite outputs `dist`,
  `api/index.ts` exports the shared Express app, `/api/(.*)` forwards to that
  Function, and non-API deep links have an `index.html` fallback. API paths are
  excluded from that fallback and return JSON 404s.
- Every active Express application route is under `/api/v1`; the Cloudinary
  upload route was versioned and the duplicate legacy health route was removed.
- `FRONTEND_URL`/`CLIENT_URL` are removed. Production adds no cross-origin
  access; local Vite development retains a fixed localhost allowlist and proxy.
- Multiple OWNER profiles are supported through the controlled CLI workflow;
  owner-only route guards protect all management operations, and a migration
  removes the retired role and prevents loss of the final active owner.
- The role-aware profile screen supports audited name/phone updates,
  reauthenticated password changes, customer order history, an owner management
  panel, secure email invitations, and reason-required owner activation changes.
  First-owner bootstrap remains CLI-only; invitation requires the backend-only
  Supabase service-role key and configured SMTP/Site URL.
- OWNER-only analytics provides Today, Yesterday, Sunday–Saturday week, calendar
  month, and validated custom ranges with previous equivalent-period comparison.
  Completed physical sales and delivered orders contribute positive events;
  sellable/damaged returns contribute negative events on the return date.
- Dashboard sections cover recognized grand-total sales, product revenue,
  delivery charges, FIFO gross profit/margin, order/unit/AOV metrics, daily
  trend, source grouping, variant rankings, open COD work, and authoritative
  batch-based inventory valuation/stock alerts.
- Migration `202608040001_milestone_5_analytics_indexes` adds only the
  `delivered_at` and `returned_at` indexes required by the event-range queries.

## Local verification on 2026-08-04

- `npm run typecheck`: passed.
- `npm run lint`: passed with no errors or warnings.
- `npm test -- --run`: 124 tests passed across fifteen files, including focused
  analytics recognition/reversal/date/inventory rules, OWNER/CUSTOMER access,
  Vercel routing, health, unified orders, FIFO inventory, and return dialogs.
- `npm run build`: passed with non-blocking bundle-size and stale Browserslist
  data warnings (781.38 kB main JavaScript chunk). The Recharts dashboard is a
  separate lazy OWNER-only chunk (406.85 kB; 113.03 kB gzip), so it is not part
  of the public storefront's initial download.
- Authenticated local Playwright smoke test loaded real sample dashboard data at
  390 px without page overflow, undersized visible controls, or console errors.
- `npm run build:server`, `npm run prisma:validate`, `npm run prisma:generate`,
  and `git diff --check`: passed.
- Migration `202608040001_milestone_5_analytics_indexes` is checked in but was
  not applied to Supabase from this workspace.

## External acceptance required

- Apply all Prisma migrations to a disposable Supabase project and run the seed.
- Apply `202608040001_milestone_5_analytics_indexes`, then compare dashboard
  totals manually against known delivered/completed/returned demonstration orders.
- Confirm there are no historical `ADMIN` profiles; the two-role migration
  intentionally stops for manual resolution rather than escalating or silently
  downgrading an identity.
- Set approved Dhaka and Outside-Dhaka charges with a real OWNER account.
- Test guest checkout, authenticated ownership, manual confirmed order, FIFO
  reservation, delivery, cancellation/failure, and both return conditions in a
  browser against real PostgreSQL.
- Run a real concurrent final-stock confirmation test.
- Verify registration/profile trigger, Cloudinary upload, the generated Vercel
  Function, same-origin behavior, SPA deep links, and production variables in a
  real Preview deployment.
- Verify owner invitation email delivery and acceptance with production-like
  Supabase SMTP/Site URL settings and the Vercel service-role secret.
- Obtain client-approved delivery charges. Cloudinary and Vercel remain untested.

## Not started

- Milestone 6 final accessibility/performance/deployment acceptance.
