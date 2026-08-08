# Nafah Agro V1 Project Scope

## 1. Purpose

Nafah Agro V1 is a Bangla-focused storefront and sales-management system for a local organic-food SME. It combines website orders, physical-shop sales, and manually entered Facebook, phone, and WhatsApp orders in one practical system.

V1 is not a full ERP or accounting platform. It must be reliable, simple to operate, and small enough to implement and maintain safely.

## 2. Confirmed technology and delivery direction

- Frontend: React, TypeScript, Vite, React Router, Tailwind CSS, and reusable parts of the current UI
- Backend: Node.js, Express, TypeScript, and Zod
- Database: PostgreSQL with Prisma, hosted by Supabase
- Authentication: Supabase Auth
- Images: Cloudinary
- Hosting: one Vercel project for the Vite frontend and Express API, Supabase database/auth, and Cloudinary images
- Repository layout: keep `src/`, `server/`, `prisma/`, and `docs/`; do not introduce a monorepo

There was no production dataset to migrate during the V1 rebuild. The checked-in implementation is now PostgreSQL/Prisma with Supabase Auth; no compatibility, dual-write, or historical-data cutover path is part of V1.

## 3. Roles and access

### OWNER

- Has full business access
- Multiple owner accounts are allowed and have the same business access
- Owner access is granted only through a controlled operational command
- After bootstrap, an active owner can email-invite additional owners from the profile screen
- The final active owner cannot be deleted, disabled, or demoted
- Another owner may permanently delete an account only when it has no business
  or actor-audit references; self-deletion is blocked
- Can view buying costs, inventory value, gross profit, and profit margins
- Can manage prices, stock batches, adjustments, orders, discounts, and delivery rates

### CUSTOMER

- Customer accounts are optional but available
- Registered customers can manage their profile and view their own orders
- Customer phone number is required
- Email/password login uses Supabase Auth

### Guest

- Can browse, use the cart, and place a cash-on-delivery order
- Must provide name, phone number, delivery address, and delivery zone
- Email is optional
- No account or phone OTP is required

## 4. Product and price management

Owners can:

- Create, edit, activate, and deactivate categories and products
- Permanently delete only empty categories and never-used products with zero
  stock and no adjustment, order, or selling-price update history
- Add Cloudinary images, descriptions, tags, and featured status
- Create sellable variants
- Set a unique SKU, selling price, stock total, and low-stock threshold per variant
- Change individual or multiple selling prices
- View immutable price history showing old price, new price, actor, reason, and time

Normal selling-price history is append-only. Permanent deletion removes only
the initial setup price record belonging to a never-used product, in the same
transaction as that product's variants.

Every sellable product has at least one variant. Products without visible choices use an internal default variant.

Historical order items permanently retain product, variant, SKU, quantity, selling-price, discount, buying-cost, revenue, and gross-profit snapshots.

## 5. Purchases and FIFO inventory

V1 uses FIFO only. It does not use FEFO, weighted-average costing, expiry management, suppliers, warehouses, or a separate inventory-movement ledger.

Every purchase or stock increase creates a `stock_batch`. A batch stores:

- Product variant
- Purchased quantity
- Available quantity
- Reserved quantity
- Unit buying cost
- Purchase date
- Source: purchase, opening stock, or adjustment
- Required reason for an adjustment
- Actor and timestamps

Each product variant also stores current available and reserved stock totals for fast display. Batch totals are authoritative; variant totals must be updated in the same database transaction and regularly checked for consistency.

Stock rules:

- Quantities are whole units and must be positive
- Available and reserved quantities cannot become negative
- Overselling is rejected
- FIFO order is purchase date, then creation time, then batch ID
- Direct stock editing without a recorded adjustment reason is prohibited
- A stock decrease adjustment consumes available batches using FIFO
- A stock increase adjustment creates a new adjustment batch and requires a buying cost

## 6. Order sources and stock timing

Supported sources:

- `WEBSITE`
- `PHYSICAL_SHOP`
- `FACEBOOK`
- `PHONE`
- `WHATSAPP`
- `OTHER`

Payment methods in V1:

- `CASH`
- `CASH_ON_DELIVERY`

Payment statuses:

- `UNPAID`
- `PAID`
- `REFUNDED`

Order statuses:

- `PENDING`
- `CONFIRMED`
- `PROCESSING`
- `DELIVERED`
- `COMPLETED`
- `CANCELLED`
- `RETURNED_SELLABLE`
- `RETURNED_DAMAGED`

Failed delivery uses `CANCELLED` plus a required `FAILED_DELIVERY:` reason in V1.

### Website orders

- Begin as `PENDING`
- Do not reserve stock at creation
- Reserve FIFO stock when an owner changes the order to `CONFIRMED`
- Consume reserved stock when marked `DELIVERED`
- Count revenue and gross profit only when delivered
- Release reserved stock when cancelled or marked failed delivery

Because pending website orders do not reserve stock, confirmation may fail if stock has since sold out. The UI must show this clearly.

### Facebook, phone, WhatsApp, and other delivery orders

- May be created as `PENDING` without stock reservation
- May be created as `CONFIRMED` and reserve FIFO stock immediately
- Otherwise follow the website delivery-order lifecycle

### Physical-shop sales

- Use `CASH`, `PAID`, and `COMPLETED`
- Customer details are optional
- Deduct available FIFO stock immediately
- Count revenue and gross profit immediately

### Cancellation and failed delivery

- Release all active allocations
- Count no revenue or profit
- Require a reason and audit record

### Returns

Only whole-order returns are supported:

- `RETURNED_SELLABLE`: reverse revenue/profit and restore the full quantity as new return batches using the original allocated buying costs
- `RETURNED_DAMAGED`: reverse revenue/profit but do not restore sellable stock

Partial returns are outside V1.

## 7. Pricing, discounts, and delivery charges

The backend is the authority for product prices, stock, discounts, delivery charges, totals, buying costs, and profit.

Checkout clients submit only variant IDs, quantities, customer/delivery information, and an idempotency key. The backend reloads prices and calculates all totals.

Discount rules:

- Only owners can add or modify discounts
- Guest/customer website checkout cannot invent a discount
- Discount cannot be negative or exceed subtotal
- The system warns when a discount makes the order unprofitable
- An owner may continue only after an explicit confirmation
- The warning override and actor are audited

Delivery pricing uses a small `delivery_rates` table. V1 plans:

- Dhaka
- Outside Dhaka

Final charges remain a client decision. Delivery charge is shown separately and excluded from product gross-profit calculations.

## 8. Analytics

Application constants:

- Currency: BDT
- Business timezone: `Asia/Dhaka`
- Reporting week: Sunday through Saturday

Owners can view:

- Today, yesterday, current week, current month, custom date range, and previous-period comparison
- Recognized revenue
- Gross profit and margin
- Completed/delivered order count
- Units sold and average order value
- Sales by source
- Best-selling and most-profitable products
- Available, reserved, low, and out-of-stock variants
- FIFO inventory value

Delivery orders count on `delivered_at`; physical sales count on `completed_at`. Cancelled, failed-delivery, and pending orders do not count. Whole-order returns reverse the original financial effect on the return date.

Category-performance analytics are outside V1.

## 9. Authentication, security, and audit requirements

- Supabase Auth access tokens are verified by Express
- Application profiles store role, name, phone, and active state
- Users can update their own name/phone and change password after reauthentication
- No public owner registration
- Owner creation is a repeatable controlled process for new Supabase Auth identities
- The database preserves at least one active owner
- Zod validates every API input and rejects unknown sensitive fields
- Use strict CORS, Helmet, rate limiting, request-size limits, safe errors, and environment validation
- Uploads enforce role, MIME type, file size, and file-count limits
- Cloudinary uploads validate authorization, type, size, and count. V1 stores
  secure URLs; orphan cleanup remains an explicitly documented manual operation.
- Sensitive actions create append-only audit records
- Secrets and service-role credentials remain backend-only
- Critical pricing, stock, authentication, authorization, and order behavior is tested as it is implemented

## 10. V1 acceptance criteria

V1 is complete when:

- Multiple owners authenticate securely
- Optional customer accounts work
- Guests can place server-priced COD orders
- Products, variants, images, and price history are manageable
- Purchases create FIFO stock batches
- Physical sales consume FIFO stock immediately
- Delivery orders reserve on confirmation and consume on delivery
- Cancellation and failed delivery release stock
- Whole sellable and damaged returns follow the agreed rules
- Discounts follow limits and unprofitable-order confirmation rules
- Overselling and duplicate checkout submissions are prevented
- Analytics use recognized revenue and preserved FIFO cost snapshots
- Security controls and audit logs cover sensitive features
- Automated critical tests and production smoke tests pass
- Vercel, Supabase, and Cloudinary production operation is verified

## 11. Explicitly outside V1

- Real payment gateways, bKash/Nagad gateways, SSLCommerz, or cards
- Phone OTP
- Partial returns
- FEFO, weighted-average costing, or expiry tracking
- Separate inventory-movement or reservation systems
- Supplier, warehouse, expense, or business-settings systems
- Net-profit accounting
- Printable receipts
- Category-performance analytics
- Automated SMS or WhatsApp notifications
- Barcode scanning
- Multi-warehouse inventory
- Next.js migration, mobile apps, microservices, or ERP integration

## 12. Decisions still required

- Final Dhaka and Outside Dhaka delivery charges
- Whether customer registration is enabled at public launch or introduced later
- Initial owner email and responsible account owner
- Expected opening stock and buying cost for launch
- Whether confirmed delivery orders may move directly to delivered or must pass through processing
