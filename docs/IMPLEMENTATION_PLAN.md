# Nafah Agro V1 Implementation Plan

## 1. Execution principles

- Keep useful React/Vite UI and replace weak backend/database code freely
- Build six small vertical milestones that end in a working demonstration
- Use the current `src/`, `server/`, `prisma/`, and `docs/` layout
- Do not build MongoDB migration, dual-write, legacy-user, or historical-data tooling
- Keep pricing, discounts, delivery charges, stock, cost, and profit authoritative on the backend
- Add security, audit behavior, and tests within each feature
- Do not mark work complete until acceptance criteria and relevant tests pass
- Update `PROJECT_STATUS.md` after every meaningful implementation session

Status values:

```text
NOT_STARTED
IN_PROGRESS
BLOCKED
READY_FOR_REVIEW
COMPLETED
```

## 2. Milestone overview

| Milestone | Outcome | Status |
|---|---|---|
| 1 | Baseline, branding, environment, auth foundation, and hosting proof | IN_PROGRESS |
| 2 | Product, variant, image, and price-history flow | NOT_STARTED |
| 3 | Stock batches, FIFO, adjustments, and physical-shop sales | NOT_STARTED |
| 4 | Guest COD and manual delivery-order lifecycle | NOT_STARTED |
| 5 | Reliable business analytics | NOT_STARTED |
| 6 | Final security, testing, polish, and production deployment | NOT_STARTED |

## 3. Milestone 1 — Baseline, branding, environment, and proof of concept

### Goal

Establish a clean, deployable foundation before business-feature implementation.

### Work

1. Preserve the current Git baseline with an agreed branch/tag.
2. Standardize on npm and one lockfile; document the supported Node.js version.
3. Fix current lint failures and retain passing TypeScript checks.
4. Complete Nafah Agro branding throughout the application without redesigning the storefront.
5. Add validated frontend/backend environment configuration and remove fallback secrets.
6. Introduce `/api/v1`, standard success/error responses, correlation IDs, and safe errors.
7. Create the Supabase development project and Prisma foundation.
8. Implement the initial Prisma schema skeleton and migration workflow.
9. Integrate Supabase Auth token verification and `profiles`.
10. Create a controlled initial-owner procedure and owner-managed admin creation/deactivation.
11. Establish role middleware for `OWNER`, `ADMIN`, `CUSTOMER`, and public guest routes.
12. Export Express through a Vercel-compatible serverless entry.
13. Deploy a proof of concept: frontend, authenticated API, database health, and one protected owner route.

### Security and tests

- Environment validation tests
- Token verification and inactive-profile tests
- Owner/admin authorization tests
- Rate limits on authentication/admin-creation paths
- Strict CORS, Helmet, body limits, and secret scan
- No public admin/owner registration

### Acceptance criteria

- Fresh npm installation, type checks, lint, and tests pass
- Nafah Agro branding appears throughout active UI and metadata
- Frontend and backend configuration fails clearly when required values are missing
- Initial owner and multiple admins can authenticate
- Admin cannot modify or disable owner
- `/api/v1/health` verifies API and database readiness
- Separate Vercel frontend/API proof deploy works with Supabase
- No production code depends on MongoDB or custom JWT for migrated foundation routes

### Demo

- Nafah Agro storefront loads
- Owner signs in
- Owner creates/disables an admin
- Protected endpoint rejects guest and disabled admin
- Vercel API reads from Supabase PostgreSQL

### Current progress (July 30, 2026)

- Completed locally: baseline tag, npm/Node standardization, lint cleanup,
  active branding, environment validation, fallback-secret removal, Express
  security, request IDs, Prisma schema/migration/seed, Supabase JWT middleware,
  profile resolution, active-state and role middleware, rate limiting,
  controlled owner creation, Vercel entry, health/protected proof routes, and
  focused automated tests.
- Awaiting external proof: provisioned Supabase project, migration/seed against
  it, real access-token request, separate Vercel deployments, and Cloudinary
  upload verification.
- External project credentials are the remaining blocker for the live proof.

## 4. Milestone 2 — Products, variants, images, and price history

### Goal

Deliver one complete catalogue flow on PostgreSQL while reusing the storefront.

### Work

1. Implement categories, products, product images, variants, and price-history tables.
2. Create an internal default variant for products without customer-visible choices.
3. Implement owner/admin CRUD with deactivation instead of destructive deletion where records are referenced.
4. Add unique SKU and slug validation.
5. Implement individual and bulk selling-price updates with immutable history.
6. Store Cloudinary public IDs, URLs, alt text, and display order.
7. Harden upload and unused-image cleanup.
8. Replace current product/category API calls with `/api/v1`.
9. Adapt current homepage, shop, product details, product editor, cart-item shape, search, and pagination.
10. Use TanStack Query and shared Zod contracts for migrated server data/forms.

### Security and tests

- Owner/admin mutation authorization
- Customer/guest read-only access
- Zod field allowlists and negative-price rejection
- Price update/history transaction tests
- Unique slug/SKU tests
- Upload role, MIME, size, count, and deletion tests
- Paginated-list tests

### Acceptance criteria

- Owner/admin can manage categories, products, variants, images, and active state
- Every sellable product has a variant
- Price changes atomically create correct history with actor and reason
- Storefront displays current PostgreSQL data
- Cart stores variant ID and quantity; cached price remains display-only
- Cloudinary upload and safe deletion are verified
- Product and admin lists do not fetch thousands of records at once

### Demo

- Create a product and two variants
- Upload/reorder images
- Change a price and view history
- Browse, filter, open, and add the variant to cart

## 5. Milestone 3 — Purchases, FIFO, adjustments, and physical-shop sales

### Goal

Prove the complete purchase-to-sale FIFO path before building delivery reservations.

### Work

1. Implement `stock_batches`, variant stock totals, and relevant constraints/indexes.
2. Add purchase/opening-stock entry as batch creation.
3. Add owner/admin stock increase/decrease adjustments with a mandatory reason.
4. Implement FIFO locking and allocation service.
5. Implement `orders`, `order_items`, and `order_allocations`.
6. Build the physical-shop sale service and fast Bangla entry screen.
7. Add manual discounts and deterministic item-level allocation.
8. Warn on unprofitable discounts; require and audit explicit override.
9. Add whole-order sellable/damaged return handling for completed physical sales.
10. Add batch/variant consistency checks and low-stock reporting.

### Security and tests

- Decimal price, discount, cost, profit, and margin tests
- Purchase and adjustment validation/authorization
- Mandatory adjustment-reason tests
- FIFO across multiple batches
- Simultaneous sale of final stock
- Insufficient and negative-stock rejection
- Physical sale transaction rollback
- Discount limit and unprofitable-override audit tests
- Whole sellable/damaged return tests

### Acceptance criteria

- Batch totals are authoritative and equal variant cached totals
- Purchase creates a valid FIFO batch and increases available stock
- Decrease adjustment consumes FIFO; increase creates a new adjustment batch
- Physical sale consumes FIFO immediately and creates consumed allocations
- No transaction can oversell or partially update stock/order data
- Cash physical sale is completed/paid and immediately counts revenue/profit
- Discount never exceeds subtotal
- Sellable whole return restores new stock batches using original costs
- Damaged whole return restores no sellable stock

### Demo

- Add two batches with different costs
- Sell across both batches
- Show FIFO allocations and gross profit
- Attempt and reject an oversell
- Apply an unprofitable discount with confirmed warning
- Process sellable and damaged return examples

## 6. Milestone 4 — Guest COD and manual delivery orders

### Goal

Deliver website and staff-entered delivery orders using the same secure order service.

### Work

1. Add `delivery_rates` with Dhaka and Outside Dhaka rows after client approves charges.
2. Implement guest/customer website checkout with normalized phone and optional email.
3. Make website orders `PENDING` without stock reservation.
4. Add idempotency and server-authoritative prices, delivery charge, and totals.
5. Implement confirmation-time FIFO reservation.
6. Implement processing/delivery transitions and reserved-stock consumption.
7. Implement cancellation and failed-delivery release.
8. Implement Facebook, phone, WhatsApp, and other manual delivery entry.
9. Allow manual delivery orders to start pending or confirmed; confirmed creation reserves immediately.
10. Add whole-order sellable/damaged returns for delivered orders.
11. Implement optional customer registration/profile/order history.
12. Replace fake coupons/payment options and remove moderator/public-admin screens.

### Security and tests

- Manipulated price/discount/delivery/total rejection
- Guest checkout validation and rate limits
- Idempotency replay and mismatched-payload tests
- Confirmation stock-race tests
- Reservation, delivery, cancellation, and failed-delivery tests
- Invalid status-transition tests
- Customer order-ownership tests
- Owner/admin-only discount and status tests
- Whole-return reversal tests

### Acceptance criteria

- Guest can place a COD order without an account
- Name, normalized phone, address, and delivery rate are required
- Website order starts pending with no allocations
- Confirmation may fail clearly if stock is unavailable
- Confirmed orders reserve FIFO stock
- Delivered orders consume reservations and recognize revenue/profit
- Cancellation/failed delivery release reservations and recognize no revenue/profit
- Manual confirmed delivery order reserves in its creation transaction
- Registered customer can view only their own linked orders
- Fake payments, coupons, moderator flows, and public admin setup are gone

### Demo

- Place a guest Dhaka order
- Confirm and reserve it
- Deliver it and show recognized profit
- Cancel and fail delivery orders and show stock release
- Enter confirmed Facebook and phone orders
- Demonstrate duplicate-submit protection

## 7. Milestone 5 — Analytics

### Goal

Provide owner/admin reporting based only on completed business events.

### Work

1. Implement analytics query services with `Asia/Dhaka` boundaries.
2. Implement today, yesterday, Sunday–Saturday week, month, custom range, and previous-period comparison.
3. Add revenue, gross profit, margin, order count, units, and average-order metrics.
4. Add sales by source and product performance.
5. Add available/reserved/low/out-of-stock summaries.
6. Add FIFO inventory valuation.
7. Apply return reversals on return dates.
8. Build concise responsive Bangla dashboard views.

### Security and tests

- Owner/admin-only financial access
- Dhaka midnight and Sunday week-boundary tests
- Zero-revenue margin handling
- Completed/delivered recognition tests
- Cancelled/failed/pending exclusion tests
- Whole-return reversal tests
- Query/index performance checks

### Acceptance criteria

- Physical revenue uses completion time
- Delivery revenue uses delivery time
- Returns reverse the correct financial snapshots
- Product gross profit excludes delivery charge
- Inventory value includes available plus reserved batch quantities
- Owner and admins can view buying cost, inventory value, profit, and margin
- Customer and guest cannot access business analytics
- Category-performance and net-profit analytics are absent

### Demo

- Today/week/month reports
- Physical versus website/social sales
- Best-selling and most-profitable variants
- Inventory value and reserved stock
- Whole-return reversal

## 8. Milestone 6 — Final verification, polish, and deployment

### Goal

Finish cross-feature verification and launch the already-secured vertical slices.

This milestone does not postpone foundational security or testing; it verifies their completeness.

### Work

1. Review security controls across every route and role.
2. Review audit coverage, redaction, correlation IDs, and retention policy.
3. Complete unit, integration, end-to-end, accessibility, and responsive tests.
4. Resolve loading, error, empty, retry, and stock-conflict UX.
5. Verify Bangla labels, BDT formatting, Dhaka dates, and mobile admin workflows.
6. Update README, API documentation, environment examples, and owner procedures.
7. Configure production Vercel, Supabase, Cloudinary, DNS, and environment separation.
8. Apply Prisma migrations through a controlled production process.
9. Seed the owner, delivery rates, and approved opening stock.
10. Add error monitoring, uptime checks, backup ownership, rollback steps, and incident contacts.
11. Run production smoke tests and client acceptance testing.

### Acceptance criteria

- No fallback secrets, broad CORS, unsafe mass assignment, or unrestricted upload remains
- Critical unit/integration/E2E tests pass
- Lint, type checks, and production builds pass
- Owner/admin/customer/guest access matrix is verified
- Stock concurrency and order idempotency tests pass
- Vercel frontend/API, Supabase, and Cloudinary work in production
- Health monitoring and backup responsibility are documented
- Owner can perform normal operations without developer assistance

### Demo

- Complete product-to-purchase-to-sale-to-analytics workflow
- Guest and manual delivery workflows
- Role and audit review
- Production smoke-test checklist

## 9. Cross-milestone rules

For every feature:

1. Confirm the requirement and API contract.
2. Add/update Prisma schema and migration when needed.
3. Implement Zod input/output contracts.
4. Implement service transaction and authorization.
5. Add audit behavior.
6. Add unit/integration tests.
7. Connect and test the reused frontend UI.
8. Run type checks, lint, and relevant tests.
9. Demonstrate acceptance criteria.
10. Update documentation and project status.

Do not begin analytics before FIFO cost snapshots and order-recognition rules pass integration tests.

## 10. Immediate task order

1. Confirm Git baseline/working tree and choose npm lockfile policy.
2. Fix the 16 current lint errors and review 11 warnings.
3. Update active application branding to Nafah Agro.
4. Create environment schemas and remove insecure fallbacks.
5. Prove the separate Vercel Express API can reach Supabase PostgreSQL/Auth.
6. Initialize Prisma and the profile/auth foundation.

The first coding task should be a small Milestone 1 foundation branch covering tooling verification, environment validation, branding inventory, and the Vercel/Supabase proof—not product or inventory implementation.
