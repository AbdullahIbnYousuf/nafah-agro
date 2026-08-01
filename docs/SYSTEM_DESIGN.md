# Nafah Agro V1 System Design

## 1. Architecture

```text
React + Vite browser application
            |
            | HTTPS /api/v1
            v
Express + TypeScript API on Vercel
       |                     |
       v                     v
Supabase Auth         PostgreSQL on Supabase
                           through Prisma
       |
       v
Cloudinary product images
```

The current React/Vite UI is reused where practical. MongoDB/Mongoose routes and custom JWT authentication may be replaced because there is no production data to migrate.

The backend is authoritative for authentication, roles, prices, discounts, delivery charges, stock, FIFO allocation, totals, buying costs, profit, and analytics.

## 2. Repository layout

Keep the current simple repository shape:

```text
src/
  components/
  contexts/
  hooks/
  lib/
  pages/
  schemas/

server/
  routes/
  controllers/
  services/
  repositories/
  middleware/
  schemas/
  lib/

prisma/
  schema.prisma
  migrations/
  seed.ts

docs/
  PROJECT_SCOPE.md
  SYSTEM_DESIGN.md
  IMPLEMENTATION_PLAN.md
  PROJECT_STATUS.md
```

Business logic belongs in services. Express handlers validate input, call a service, and format the response. Prisma access should be isolated in services/repositories rather than spread through route files.

## 3. Application constants

These values are code constants, not configurable database settings:

```text
CURRENCY = BDT
BUSINESS_TIMEZONE = Asia/Dhaka
WEEK_START = Sunday
WEEK_END = Saturday
```

PostgreSQL stores timestamps in UTC. The API applies `Asia/Dhaka` boundaries for business reports.

Money uses PostgreSQL `numeric(14,2)` and Prisma `Decimal`. JavaScript floating-point values are not used for authoritative money calculations. V1 quantities are positive whole units.

## 4. Authentication and roles

Supabase Auth owns login identities. PostgreSQL owns application profiles.

```text
profiles
- id: UUID, primary key; equals Supabase Auth user ID
- role: OWNER | ADMIN | CUSTOMER
- full_name
- phone_number
- is_active
- created_at
- updated_at
```

Authentication flow:

1. Registered user signs in through Supabase Auth.
2. Frontend sends the Supabase access token as a bearer token.
3. Express verifies token signature, issuer, audience, and expiry.
4. Express loads the profile and checks `is_active`.
5. Route authorization checks `OWNER`, `ADMIN`, or `CUSTOMER`.

Guest checkout is unauthenticated and creates an order without a profile ID. The initial owner is created through a one-time controlled script or protected operational procedure. Only the owner can create/disable admins. Supabase service-role credentials are backend-only.

## 5. Core database model

### Categories and products

```text
categories
- id
- name
- slug: unique
- is_active
- created_at
- updated_at

products
- id
- category_id
- name
- slug: unique
- description
- featured
- is_active
- created_at
- updated_at

product_images
- id
- product_id
- cloudinary_public_id
- secure_url
- alt_text
- display_order
- created_at

product_variants
- id
- product_id
- name
- sku: unique
- current_selling_price
- available_stock
- reserved_stock
- low_stock_threshold
- is_active
- created_at
- updated_at
```

Every sellable product has at least one variant. Variant stock totals are maintained transactionally for fast reads but must equal the totals derived from open stock batches.

### Selling-price history

```text
selling_price_history
- id
- product_variant_id
- previous_price
- new_price
- reason
- changed_by_profile_id
- effective_at
- created_at
```

Price updates and history insertion occur in one transaction. History is immutable.

### Stock batches

`stock_batches` is both the purchase/restock record and the FIFO source.

```text
stock_batches
- id
- product_variant_id
- source: OPENING | PURCHASE | ADJUSTMENT | SELLABLE_RETURN
- purchased_quantity
- available_quantity
- reserved_quantity
- unit_buying_cost
- purchase_date
- reason
- created_by_profile_id
- source_order_id: nullable, used for sellable returns
- created_at
- updated_at
```

Constraints:

- `purchased_quantity > 0`
- `available_quantity >= 0`
- `reserved_quantity >= 0`
- `available_quantity + reserved_quantity <= purchased_quantity`
- `unit_buying_cost >= 0`
- Adjustment batches require a reason

Canonical stock is the sum of batch `available_quantity` and `reserved_quantity`. Product-variant totals are transactional cached totals. A consistency check compares both.

FIFO selection order:

```sql
ORDER BY purchase_date ASC, created_at ASC, id ASC
```

Eligible batches are locked inside a PostgreSQL transaction.

### Orders

```text
orders
- id
- order_number: unique, human-readable
- idempotency_key: nullable, unique within checkout scope
- source
- status
- payment_method
- payment_status
- customer_profile_id: nullable
- customer_name
- customer_phone
- customer_email: nullable
- customer_address: nullable for physical sales
- delivery_rate_id: nullable for physical sales
- subtotal
- discount_total
- delivery_charge
- grand_total
- total_buying_cost: nullable until stock is allocated
- gross_profit: nullable until stock is allocated
- unprofitable_override_confirmed
- unprofitable_override_by_profile_id: nullable
- created_by_profile_id: nullable for guests
- placed_at
- confirmed_at: nullable
- completed_at: nullable
- delivered_at: nullable
- cancelled_at: nullable
- returned_at: nullable
- status_reason: nullable
- created_at
- updated_at

order_items
- id
- order_id
- product_id
- product_variant_id
- product_name_snapshot
- variant_name_snapshot
- sku_snapshot
- quantity
- unit_selling_price
- gross_line_revenue
- allocated_discount
- net_line_revenue
- total_buying_cost
- gross_profit
- created_at
```

Order snapshots remain unchanged when products, prices, or SKUs change.

### FIFO order allocations

`order_allocations` records the batches assigned to each order item.

```text
order_allocations
- id
- order_item_id
- stock_batch_id
- quantity
- unit_buying_cost
- total_buying_cost
- state: RESERVED | CONSUMED | RELEASED
- reserved_at: nullable
- consumed_at: nullable
- released_at: nullable
- created_at
- updated_at
```

One order item can use multiple batches. Released records remain for auditability and are never silently deleted.

### Delivery rates

```text
delivery_rates
- id
- code: DHAKA | OUTSIDE_DHAKA
- name
- charge
- is_active
- updated_by_profile_id
- created_at
- updated_at
```

Only owner/admin can update rates; updater and timestamp are stored. The two
rows start with null charges, and checkout rejects them until the client-approved
charges are entered.

### Audit logs

```text
audit_logs
- id
- actor_profile_id: nullable for guest/system events
- action
- entity_type
- entity_id
- previous_data: redacted JSON
- new_data: redacted JSON
- reason
- created_at
```

Audit logs are append-only through a database trigger and are written inside the
same transaction as order/rate changes. Passwords, tokens, Supabase keys, and
other secrets are never recorded. Request IDs remain in structured application
logs rather than this V1 table.

## 6. Stock transaction rules

### Purchase or stock increase

1. Validate quantity, buying cost, date, and reason when required.
2. Create a new stock batch.
3. Increase variant available stock.
4. Write an audit record.
5. Commit as one transaction.

### Stock decrease adjustment

1. Require owner/admin and a reason.
2. Lock available batches in FIFO order.
3. Reject insufficient stock.
4. Reduce batch available quantities.
5. Reduce variant available stock.
6. Audit every affected batch and the total adjustment.
7. Commit as one transaction.

No separate movement table is used in V1.

### Reserve a delivery order

1. Lock the order and confirm its status allows confirmation.
2. Lock eligible available batches in FIFO order.
3. Reject if total available stock is insufficient.
4. For each allocation, reduce batch available quantity and increase batch reserved quantity.
5. Apply the same changes to variant totals.
6. Create `RESERVED` order allocations with buying-cost snapshots.
7. Calculate item/order cost and projected gross profit.
8. Change the order to `CONFIRMED` and audit the transition.
9. Commit.

### Deliver a reserved order

1. Lock order, allocations, and batches.
2. Require all allocations to be `RESERVED`.
3. Reduce batch and variant reserved quantities.
4. Mark allocations `CONSUMED`.
5. Persist final cost and gross-profit snapshots.
6. Mark order `DELIVERED`, `PAID`, and set `delivered_at`.
7. Commit.

### Physical-shop sale

1. Validate server-calculated prices and discount.
2. Lock and consume available batches in FIFO order.
3. Reduce batch and variant available quantities.
4. Create `CONSUMED` allocations.
5. Mark order `COMPLETED` and `PAID`.
6. Store cost/profit snapshots and audit.
7. Commit.

### Cancellation or failed delivery

For a confirmed/processing delivery order:

1. Lock reserved allocations and batches.
2. Reduce batch/variant reserved quantities.
3. Restore batch/variant available quantities.
4. Mark allocations `RELEASED`.
5. Mark order `CANCELLED`; prefix failed-delivery reasons with `FAILED_DELIVERY:`.
6. Store the required reason; count no revenue/profit.
7. Commit.

A pending order has no allocations to release.

### Whole-order return

- Only a fully delivered/completed order can be returned.
- `RETURNED_SELLABLE` creates new return batches using the original allocation quantities and buying costs, reverses recognized revenue/profit, and audits the action.
- `RETURNED_DAMAGED` reverses recognized revenue/profit without creating stock.
- Partial returns are rejected in V1.

## 7. Order creation and pricing

### Guest website request

```json
{
  "items": [
    { "productVariantId": "uuid", "quantity": 2 }
  ],
  "customer": {
    "name": "Customer Name",
    "phone": "+8801XXXXXXXXX",
    "email": null,
    "address": "Delivery address"
  },
  "deliveryRateId": "uuid",
  "idempotencyKey": "unique-key"
}
```

The backend:

1. Validates and normalizes input.
2. Loads active variants, prices, and the delivery rate.
3. Calculates subtotal, delivery charge, and grand total.
4. Creates a `PENDING`, `UNPAID`, `CASH_ON_DELIVERY` order.
5. Does not reserve stock.
6. Replays the same response for a valid repeated idempotency key and rejects key reuse with a different payload.

Only owner/admin manual-order endpoints accept discounts. Discount is allocated proportionally across items using a deterministic rounding rule. A discount cannot exceed subtotal. For a physical or immediately confirmed manual order, the unprofitable warning is evaluated in the creation transaction. For a pending manual order, it is evaluated when confirmation selects the FIFO batches. If projected profit is negative, an explicit owner/admin override confirmation is required and audited before the transaction continues.

## 8. Allowed status transitions

```text
PENDING -> CONFIRMED
PENDING -> CANCELLED

CONFIRMED -> PROCESSING
CONFIRMED -> DELIVERED
CONFIRMED -> CANCELLED

PROCESSING -> DELIVERED
PROCESSING -> CANCELLED

DELIVERED -> RETURNED_SELLABLE
DELIVERED -> RETURNED_DAMAGED

COMPLETED -> RETURNED_SELLABLE
COMPLETED -> RETURNED_DAMAGED
```

Every transition is enforced by the backend and recorded in `audit_logs` with previous status, next status, actor, time, and reason where required.

## 9. API shape

Application routes use `/api/v1`; business logic is not duplicated in the Vercel entry point.

```text
/api/v1/health
/api/v1/auth
/api/v1/admins
/api/v1/categories
/api/v1/products
/api/v1/variants
/api/v1/prices
/api/v1/stock-batches
/api/v1/stock-adjustments
/api/v1/orders
/api/v1/delivery-rates
/api/v1/analytics
/api/v1/audit-logs
/api/v1/upload
```

Success:

```json
{ "success": true, "data": {} }
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "The requested quantity is not available.",
    "details": {}
  }
}
```

Admin lists use server pagination, filtering, and sorting.

## 10. Frontend design

- Keep browser-local cart state; cached prices are display-only
- Use TanStack Query for server data and mutation invalidation
- Use React Hook Form and Zod for important forms
- Keep React Context for authentication wrapper, cart, and small UI preferences
- Update API types/contracts together with each backend vertical slice
- Show clear price changes, stock-confirmation failures, loading states, and recoverable errors
- Moderator screens, public admin setup, fake coupons, and fake online-payment choices are removed

## 11. Security and operational design

Every milestone includes:

- Strict Zod schemas and field allowlists
- Authentication/authorization tests
- Helmet, strict CORS, body limits, and rate limits
- Safe production errors and correlation IDs
- Transaction and concurrency tests for stock operations
- Upload MIME, count, and size restrictions
- Cloudinary public-ID storage and controlled deletion
- Dependency and secret review
- Append-only audit logging for sensitive actions

Required environment variables:

```text
# Frontend (public)
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY

# Backend
DATABASE_URL
DIRECT_URL
SUPABASE_URL
SUPABASE_JWT_AUDIENCE
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
NODE_ENV
JSON_BODY_LIMIT
```

The Express API is exported through `api/index.ts` instead of relying on a permanent `app.listen()`. Vercel forwards `/api/:path*` to this single Function, and the frontend uses same-origin `/api` in production. Prisma uses the Supabase pooled URL at runtime and the direct URL for migrations.

## 12. Analytics rules

- Physical sales recognize revenue/cost at `completed_at`
- Delivery orders recognize revenue/cost at `delivered_at`
- Pending, confirmed, processing, cancelled, and failed-delivery orders do not count as revenue
- Whole returns create reversing financial effects on `returned_at`
- Product gross profit excludes delivery charge
- Inventory value is the sum of `(available_quantity + reserved_quantity) × unit_buying_cost`
- Date boundaries use `Asia/Dhaka`
- Weeks run Sunday through Saturday
- Owner and admins can access all V1 financial and inventory analytics

## 13. Required tests

Unit:

- BDT decimal calculations and discount allocation
- Phone normalization
- Status transitions
- Profit and margin calculations
- Dhaka date/week boundaries

Integration:

- Owner/admin/customer/guest permissions
- Price history transaction
- Batch creation and stock adjustments
- FIFO reservation, consumption, release, and insufficient-stock rejection
- Simultaneous confirmation of the final units
- Physical sale
- Guest idempotent checkout
- Manual confirmed delivery order
- Whole sellable/damaged returns
- Audit creation

End-to-end:

- Guest COD order
- Owner/admin login and admin management
- Product/variant/price update
- Purchase and physical sale
- Delivery confirmation, delivery, cancellation, and failed delivery
- Analytics refresh

## 14. Deployment acceptance

- Frontend and API deploy as one Vercel project with `/api/*` isolated from the SPA fallback
- Vercel serverless API proof of concept succeeds before feature expansion
- Supabase pooled and direct connections are tested
- Prisma migrations run through a controlled deployment step
- Same-origin production requests and HTTPS are enforced; a fixed local CORS allowlist supports Vite development
- Cloudinary upload/delete is verified
- Health check includes API and database readiness
- Production smoke tests, backup responsibility, error monitoring, and rollback instructions are documented
