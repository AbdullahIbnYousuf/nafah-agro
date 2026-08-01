# Nafah Agro V1 Implementation Plan

## Working rules

- Keep the current `src/`, `server/`, `prisma/`, and `docs/` layout.
- Reuse useful React/Vite UI; replace weak backend/database code freely.
- Build vertical slices with authorization, validation, auditability, and tests.
- Do not migrate historical MongoDB data; there is no production data to keep.
- Use BDT, `Asia/Dhaka`, Sunday–Saturday reporting, FIFO only, and guest COD.
- Deploy only after local checks and a Supabase/Vercel proof succeeds.

## Milestone 1 — Foundation

Status: complete in code; live external-service verification is pending.

- Baseline tag and focused foundation commit.
- npm and Node.js standardization.
- Express security, request IDs, safe errors, health endpoint, and rate limits.
- Prisma/Supabase PostgreSQL connection and seed.
- Supabase token verification, PostgreSQL profiles, OWNER/ADMIN/CUSTOMER guards,
  and controlled first-owner command.
- Vercel-compatible frontend/backend layout and documentation.

## Authentication cleanup gate

Status: complete in code; real Supabase verification pending.

- Removed public admin setup, unlock code, moderators, Mongo users, bcrypt,
  custom JWT issuance/verification, and legacy auth routes.
- Frontend uses Supabase login/logout/signup/session restoration.
- Every protected Express request resolves an active PostgreSQL profile.
- Customer self-registration creates only `CUSTOMER`; no public privileged signup.
- Guest checkout remains available independently of customer accounts.

Acceptance checks:

- Guest is redirected from protected frontend routes.
- OWNER and ADMIN can open admin routes; CUSTOMER cannot.
- Missing/inactive profiles are denied.
- No custom application signing or public unlock secret is required.

## Milestone 2 — Product and pricing vertical

Status: complete in code; external acceptance remains.

Implemented sequence:

1. Category create/edit/deactivate and public list.
2. Product create/edit/deactivate with PostgreSQL storefront reads.
3. Initial variant at product creation; additional-variant API.
4. Current selling price stored on each variant.
5. Immutable price-history row written transactionally for initial/change prices.
6. Existing home, shop, search/filter, and product-detail UI read `/api/v1`.
7. Admin UI creates/edits/activates variants, manages normalized unique SKUs,
   selects defaults, views immutable price history, and performs transactional
   single/bulk selling-price changes.
8. MongoDB product/category compatibility routes and models are removed; MongoDB
   is isolated to the temporary order vertical.

Required follow-up acceptance work:

- Apply migration and test with real Supabase Auth/PostgreSQL.
- Verify OWNER and ADMIN catalog and price changes with real tokens; confirm
  CUSTOMER and inactive-profile denial.
- Verify unique SKU/slug errors are returned safely.
- Test Cloudinary image upload and storefront rendering.
- Test customer signup/profile trigger and fallback recovery in real Supabase.
- Run the catalog demonstration against the migrated Supabase database.

## Milestone 3 — Purchases, FIFO, physical-shop sales

Do not start until Milestone 2 acceptance passes.

- Add `stock_batches` and `order_allocations`.
- Purchases create batches with purchased/available/reserved quantities, buying
  cost, and purchase date.
- FIFO allocation locks rows and never allows negative quantities.
- Admin adjustments require a reason and audit entry.
- Physical-shop sales consume FIFO immediately.

## Milestone 4 — Guest COD and manual delivery orders

- Replace the MongoDB order flow with PostgreSQL.
- Website orders start `PENDING` without reservation.
- Confirmation reserves FIFO; delivered consumes; cancel/failure releases.
- Phone/Facebook/WhatsApp orders may confirm immediately.
- Whole-order sellable/damaged returns only.
- Dhaka/outside-Dhaka rates come from `delivery_rates`; charges await client input.
- Remove Mongoose, Mongo models, and `MONGO_URI` only after all order consumers move.

## Milestone 5 — Analytics

- Revenue/profit only for delivered orders.
- Whole returns reverse revenue/profit; sellable restores stock, damaged does not.
- Owner and admins see buying cost, inventory value, gross profit, and margin.
- Weekly reporting is Sunday through Saturday.

## Milestone 6 — Security, testing, polish, deployment

Security/testing remain part of each earlier slice; this milestone is the final
cross-system gate, not deferred cleanup.

- Full authorization matrix and abuse-case tests.
- FIFO concurrency/invariant tests and order lifecycle integration tests.
- Accessibility, responsive, performance, logging, and recovery checks.
- Vercel frontend/backend deployment, Supabase migration, Cloudinary validation,
  CORS/domain verification, smoke tests, and rollback notes.
