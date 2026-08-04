# Nafah Agro V1 Implementation Plan

## Working rules

- Keep `src/`, `server/`, `prisma/`, and `docs/`; reuse practical React/Vite UI.
- Use Supabase Auth, PostgreSQL/Prisma, Express, Zod, Cloudinary, BDT,
  `Asia/Dhaka`, Sunday–Saturday reporting, FIFO only, and guest COD.
- Authorization, validation, invariants, security, and tests belong in each slice.
- There is no MongoDB data migration or compatibility phase.

## Milestone 1 — Foundation

Status: complete in code; live Supabase/Vercel proof remains.

- npm/Node baseline, Express security, safe errors, health/rate limits.
- Prisma/Supabase connectivity, profiles, token verification, role guards, and
  controlled repeatable owner command. Active roles are OWNER and CUSTOMER;
  multiple owners are allowed and the final active owner is database-protected.

## Milestone 2 — Catalog and price history

Status: complete in code; real Supabase/Cloudinary acceptance remains.

- Category → product → required default variant → unique SKU → selling price →
  immutable history → PostgreSQL storefront/admin UI.

## Milestone 3 — Purchases, FIFO, physical-shop sales

Status: complete in code; real PostgreSQL concurrency acceptance remains.

- Multi-item purchases, costed batches, cached variant totals, FIFO allocation,
  reason-required adjustments, immediate CASH/PAID physical sales, preserved
  price/cost snapshots, discount/loss confirmation, profit visibility.

## Milestone 4 — Unified COD and manual delivery orders

Status: complete in local code; external migration/browser acceptance remains.

Implemented order:

1. Extend the existing sales order/item/allocation tables; add delivery rates.
2. Guest/registered WEBSITE COD begins pending with server-only pricing and an
   idempotency key; pending stock is unchanged.
3. OWNER confirmation reserves exact FIFO allocations transactionally.
4. FACEBOOK/PHONE/WHATSAPP/OTHER orders can begin pending or confirmed.
5. Processing and delivery consume reservations and recognize payment/financials.
6. Cancellation or failed delivery releases reservations and records a reason.
7. Whole SELLABLE returns restore cost-preserving stock; DAMAGED returns do not.
8. Replace cart, profile history, and admin consumers; remove Mongo/Mongoose and
   fake coupon/payment UI.

Acceptance gate before Milestone 5:

- Apply migration/seed on disposable Supabase.
- Enter client-approved Dhaka/outside-Dhaka rates.
- Use real OWNER, CUSTOMER, and guest sessions to demonstrate every order
  transition and denial; verify a concurrent final-stock confirmation.
- Confirm existing physical-shop sales still complete and appear in unified list.
- Run full local checks and browser smoke tests; do not deploy yet.

## Milestone 5 — Analytics

Status: not started.

- Revenue/profit recognized for delivered delivery orders and completed physical
  sales only; whole returns reverse recognition by return status.
- Inventory value, buying cost, gross profit, and margin visible to OWNER.
- Sunday–Saturday BDT reporting. No expense/net-profit/category-performance work.

## Milestone 6 — Security, testing, polish, deployment

Status: cross-feature work exists; final gate not started.

- Complete authorization/abuse, FIFO invariant, order lifecycle, accessibility,
  responsive, performance, logging/recovery, and production smoke checks.
- Deploy the combined frontend/API Vercel project, PostgreSQL/Auth to Supabase, images to
  Cloudinary; verify CORS/domains and rollback notes.
