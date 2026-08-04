# Nafah Agro Project Status

Last updated: 2026-08-01

## Summary

Milestones 1–4 are complete in local code. Milestone 4 replaces every remaining
MongoDB order flow with one PostgreSQL order system while preserving Milestone 3
physical-shop behavior. No external migration, real Supabase/Cloudinary test,
or analytics dashboard was performed. Vercel now serves the frontend and shared
Express Function. Its named API rewrite capture was found to enter `req.query`
and break strict admin list validation; the rewrite now uses an unnamed capture.

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

## Local verification on 2026-08-01

- `npm run typecheck`: passed.
- `npm run lint`: passed with no errors or warnings.
- `npm test -- --run`: 107 tests passed across fourteen files, including focused
  Vercel routing, same-origin/local CORS, health, API 404, unified-order,
  inventory, authorization, and return-dialog coverage.
- `npm run build`: passed with non-blocking bundle-size and stale Browserslist
  data warnings (776.48 kB main JavaScript chunk).
- Built Vite preview smoke test: `/`, `/admin`, `/shop`, and
  `/products/demo-slug` each returned `200 text/html`.
- `npm run build:server`, `npm run prisma:validate`, `npm run prisma:generate`,
  and `git diff --check`: passed.
- Migrations `202608010002_milestone_4_unified_orders` and
  `202608010001_multiple_owners` are checked in but have not been applied to
  Supabase from this workspace.

## External acceptance required

- Apply all Prisma migrations to a disposable Supabase project and run the seed.
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

- Milestone 5 analytics dashboard and reporting.
- Milestone 6 final accessibility/performance/deployment acceptance.
