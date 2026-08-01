# Nafah Agro Project Status

Last updated: 2026-08-01

## Summary

Milestones 1–4 are complete in local code. Milestone 4 replaces every remaining
MongoDB order flow with one PostgreSQL order system while preserving Milestone 3
physical-shop behavior. No external migration, real Supabase/Cloudinary test,
deployment, analytics dashboard, or commit was performed.

## Completed in code

- Supabase Auth, active PostgreSQL profiles, OWNER/ADMIN/CUSTOMER authorization,
  strict environment validation, Express security/rate limits, and health checks.
- PostgreSQL categories, products, variants, unique SKUs, current price, immutable
  price history, purchases, stock batches, reason-required adjustments, FIFO
  allocations, variant stock totals, and immediate physical-shop sales.
- Unified `SalesOrder`, `SalesOrderItem`, and `OrderAllocation` support WEBSITE,
  PHYSICAL_SHOP, FACEBOOK, PHONE, WHATSAPP, and OTHER.
- Guest website COD sends no financial fields, is idempotent, and starts pending
  without reservation. Authenticated checkout attaches the verified profile.
- OWNER/ADMIN confirmation reserves exact FIFO batches in a serializable
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
- Mongo startup, Mongoose dependency/model, `/api/orders`, Mongo utility, and
  `MONGO_URI` have been removed.

## Local verification on 2026-08-01

- `npm run typecheck`: passed.
- `npm run lint`: passed with no errors or warnings.
- `npm test -- --run`: 77 tests passed across seven files, including 18 focused
  unified-order service tests, 10 existing inventory/physical-sale tests, and
  route role/guest tests.
- `npm run build`: passed with non-blocking bundle-size and stale Browserslist
  data warnings (727.52 kB main JavaScript chunk).
- `npm run build:server`, `npm run prisma:validate`, `npm run prisma:generate`,
  and `git diff --check`: passed.
- Migration `202608010002_milestone_4_unified_orders` is checked in but has not
  been applied to Supabase.

## External acceptance required

- Apply all Prisma migrations to a disposable Supabase project and run the seed.
- Set approved Dhaka and Outside-Dhaka charges with a real OWNER/ADMIN account.
- Test guest checkout, authenticated ownership, manual confirmed order, FIFO
  reservation, delivery, cancellation/failure, and both return conditions in a
  browser against real PostgreSQL.
- Run a real concurrent final-stock confirmation test.
- Verify registration/profile trigger, Cloudinary upload, Vercel-compatible API,
  CORS, and production environment variables.
- Obtain client-approved delivery charges. Cloudinary and Vercel remain untested.

## Not started

- Milestone 5 analytics dashboard and reporting.
- Milestone 6 final accessibility/performance/deployment acceptance.
