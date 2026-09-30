# Nafah Agro API

Base URL: `/api`; application endpoints are under `/api/v1`. Successful v1
responses use `{ "success": true, "data": ... }`; errors use
`{ "success": false, "error": { "code", "message", "details" } }`.

Protected requests send `Authorization: Bearer SUPABASE_ACCESS_TOKEN`. Express
verifies the Supabase token, loads the active PostgreSQL profile, and enforces
`OWNER` or `CUSTOMER`. User metadata never grants roles.

## Foundation and profiles

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/health` | Public | API/PostgreSQL readiness |
| `GET` | `/api/v1/auth/me` | Active profile | Resolve token to profile |
| `PATCH` | `/api/v1/auth/me` | Active profile | Update own name and required phone |
| `POST` | `/api/v1/auth/complete-customer-profile` | Supabase user | Recover only the token subject's CUSTOMER profile |
| `GET` | `/api/v1/foundation` | Active profile | PostgreSQL proof endpoint |
| `GET` | `/api/v1/foundation/owner` | OWNER | Owner-only proof |
| `GET` | `/api/v1/owners` | OWNER | List owner profiles, Auth state, promotion source, and safe-demotion eligibility |
| `POST` | `/api/v1/owners/invitations` | OWNER | Invite a new Auth email; return a promotion candidate when the email is already a CUSTOMER |
| `POST` | `/api/v1/owners/promotions` | OWNER | Reason-required existing CUSTOMER to OWNER role change without replacing the identity |
| `POST` | `/api/v1/owners/:id/demotion` | OWNER | Reason-required reversal for an unused owner previously promoted from CUSTOMER |
| `PATCH` | `/api/v1/owners/:id/status` | OWNER | Reason-required activate/deactivate; self/final-owner protected |
| `DELETE` | `/api/v1/owners/:id` | OWNER | Permanently delete another ordinary invited owner only when no business or audit history exists |

Owner invitations require the backend-only `SUPABASE_SERVICE_ROLE_KEY`. Public
registration always creates `CUSTOMER`; metadata can never grant OWNER. The CLI
workflow remains the bootstrap/recovery path for the first owner.

`CUSTOMER_EMAIL_EXISTS` includes owner-visible `customerProfileId`, `fullName`,
`phoneNumber`, `email`, and `isActive` details so the frontend can request an
explicit promotion reason. `OWNER_EMAIL_EXISTS` and
`AUTH_IDENTITY_PROFILE_MISSING` keep already-owned and inconsistent identities
out of the invitation path. Promotion/demotion preserve customer orders and Auth
credentials. Demotion is blocked for self, the final active owner, inactive
targets, ordinary owners, stale roles, and promoted owners with management work.

## Catalog and inventory

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/categories` | Public | Active categories set to Show |
| `GET` | `/api/v1/admin/categories` | OWNER | All categories |
| `POST/PATCH` | `/api/v1/categories`, `/categories/:id` | OWNER | Create/edit category and independently set Active or Show |
| `DELETE` | `/api/v1/categories/:id` | OWNER | Permanently delete an empty category only |
| `GET` | `/api/v1/products`, `/products/:slug` | Public | Active packaged and egg storefront catalog set to Show |
| `GET` | `/api/v1/admin/products`, `/admin/products/:id` | OWNER | Full catalog list and direct product lookup, including inactive records |
| `GET` | `/api/v1/admin/variant-options`, `/admin/variant-options/:variantId` | OWNER | Async product/pack-size options for inventory, physical-sale, and manual-order forms |
| `POST/PATCH` | `/api/v1/products`, `/products/:id` | OWNER | Create/edit product and independently set Active or Show |
| `PATCH` | `/api/v1/products/:id/kind` | OWNER | Correct an entirely unused product type |
| `DELETE` | `/api/v1/products/:id` | OWNER | Delete only a product with no stock, adjustment, order, or price-update history |
| `POST/PATCH` | `/api/v1/products/:id/variants`, `/variants/:id` | OWNER | Create/edit a pack/size; SKU is generated internally |
| `PATCH` | `/api/v1/variants/:id/selling-price` | OWNER | Single price change/history append |
| `POST` | `/api/v1/variants/selling-prices/bulk` | OWNER | Atomic bulk price change |
| `GET` | `/api/v1/variants/:id/price-history` | OWNER | Immutable price history |
| `GET` | `/api/v1/stock-batches` | OWNER | FIFO batches and costs |
| `GET` | `/api/v1/inventory/summary` | OWNER | Stock-item counts, alerts, and current buying-cost value |
| `GET` | `/api/v1/inventory/items` | OWNER | Paginated stock identities with search, status, category, and sorting |
| `GET` | `/api/v1/inventory/items/:variantId/batches` | OWNER | One stock identity's current or complete FIFO batch list |
| `GET` | `/api/v1/inventory/records` | OWNER | Paginated stock additions, legacy adjustments, losses, corrections, and reconciliations |
| `POST` | `/api/v1/purchases` | OWNER | Atomic multi-item purchase |
| `POST` | `/api/v1/stock-adjustments` | OWNER | Reason-required increase/decrease |
| `POST` | `/api/v1/inventory/stock-losses` | OWNER | Consume available stock FIFO and record a stock loss using today's Dhaka date |
| `POST` | `/api/v1/inventory/reconciliations` | OWNER | Reconcile physical on-hand stock; reduce FIFO or add a batch at the latest known cost |
| `POST` | `/api/v1/inventory/stock-batches/:batchId/correction` | OWNER | Correct a purchase batch quantity or buying cost without deleting the original record |
| `POST/GET` | `/api/v1/physical-sales` | OWNER | Immediate FIFO paid or credit sale/list |
| `GET` | `/api/v1/credit-customers/suggestions` | OWNER | Find existing বাকি customers by name for physical-sale selection |
| `GET` | `/api/v1/credit-customers`, `/credit-customers/:id` | OWNER | Customer-level balances and combined sale/payment/return records |
| `GET` | `/api/v1/credit-customers/summary` | OWNER | Customer-level outstanding and reminder counts |
| `PATCH` | `/api/v1/credit-customers/:id` | OWNER | Edit the unique customer name and optional phone |
| `POST` | `/api/v1/credit-customers/:id/payments` | OWNER | Record one payment and allocate it to the oldest outstanding sales |
| `POST` | `/api/v1/credit-customers/:id/payments/:paymentId/void` | OWNER | Void a customer payment with a required reason and rebuild allocations |
| `PATCH` | `/api/v1/credit-customers/:id/follow-up` | OWNER | Move the customer's single next-contact date |
| `GET` | `/api/v1/push/config` | OWNER | Read the public VAPID key for browser subscription |
| `POST/DELETE` | `/api/v1/push/subscriptions` | OWNER | Enable or disable the authenticated owner's current browser device |
| `POST` | `/api/v1/push/test` | OWNER | Send the approved test notification to the current device |
| `GET` | `/api/v1/cron/credit-reminders` | `CRON_SECRET` | Send the 9 AM Dhaka due/overdue credit reminder summary |

`/inventory/items` accepts `query`, `categoryId`, `status`, `sort`, `page`, and
`limit`. Status values are `ALL`, `IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`, and
`INACTIVE`; sorting supports `URGENCY`, `NAME`, `STOCK_ASC`, and `LAST_ADDED`.
Batch details exclude fully consumed batches unless `includeDepleted=true` is
passed. `/inventory/records` accepts `query`, `type`, `page`, and `limit`, where
`type` is `ALL`, `PURCHASE`, `ADJUSTMENT` (legacy), `STOCK_LOSS`,
`ENTRY_CORRECTION`, or `STOCK_RECONCILIATION`. Stock-loss and reconciliation
effective dates are always the current `Asia/Dhaka` date in V1; clients do not
submit a date. Losses consume only available FIFO stock, so reserved stock is
never silently removed. Batch corrections retain the original purchase record
and are rejected when the requested quantity would fall below consumed or
reserved stock.

Website-order push is scheduled only after a new non-replayed order transaction
commits. Push failure does not fail checkout. The credit cron sends nothing when
the actionable count is zero. Delivery records deduplicate each order or date
per device. Push endpoints and key material are not exposed through list APIs.

The older `/credit-sales/*` endpoints remain temporarily for unlinked legacy
credit records, but the active frontend uses only `/credit-customers/*`.

Admin category/product responses include `canDelete`, calculated by the API.
Deletion is transactional and rechecks eligibility server-side. A deleted
unused product also removes its setup variants and price-history rows; normal
price history remains immutable. Cloudinary image URLs are recorded in the
audit event, but remote image files are not deleted automatically.

Routine catalog reasons are optional. When omitted, the API records a truthful
action label such as `প্রাথমিক দাম`, `দাম পরিবর্তন`, or
`পণ্যের ধরন পরিবর্তন` so immutable price and audit history stays readable.
Stock adjustments still require an owner-entered reason.

Categories and products expose independent `isActive` and `isVisibleInShop`
flags. A category is a parent gate: an inactive category blocks its products
from new purchases, adjustments, physical sales, and delivery orders without
overwriting the products' own flags. Hide affects only the public storefront
and website checkout. Manual and physical sales may use hidden records while
they remain operationally active.

Catalog write clients do not submit or edit SKU values. Express generates an
immutable internal SKU for each new variant. Existing SKU columns and historical
snapshots remain for compatibility but are not part of the owner or customer UI.
The initial pack/size name may be blank; an additional pack/size requires the
existing internal default to be given a meaningful name first. New `PACKAGED`
products require `initialVariant.unitLabel`; new pack/sizes require `unitLabel`
(a trimmed 1–30 character label such as `বস্তা`, `ক্যান`, or `ট্রে`). Each
variant stores its own label. Existing variants default to `ইউনিট`. The label
can be changed only before stock or business history exists. Product, variant,
stock, and order responses expose the label; sale items retain
`unitLabelSnapshot`. Quantities remain whole `PIECE` values, with no conversion
to the contents of a package. Eggs and measured products keep fixed labels.

Products expose `kind`: `PACKAGED`, `LOOSE_WEIGHT`, `LOOSE_VOLUME`, or `EGG`.
Loose products keep one hidden internal variant and cannot receive more
pack/size options. Egg products also keep one hidden internal variant and expose
`bulkSellingPrice` plus the fixed `bulkMinimumQuantity: 15`. Their regular price
applies to 1–14 eggs; at 15 or more, the lower bulk rate applies to the entire
line. Public catalog endpoints return `PACKAGED` and `EGG`; owner catalog
endpoints return every type. The kind-correction endpoint is rejected
after stock, purchases, adjustments, sales, or a real price change exists.

Egg create, kind-correction, single-price, and bulk-price writes submit the
regular `sellingPrice` together with `bulkSellingPrice`. Both must be positive,
and the bulk rate must be lower. Price history records `REGULAR` and `EGG_BULK`
independently. Order-item responses include `sellingPriceTier`, preserving the
server-selected rate used at sale time. Website and manual order quantities stay
positive whole integers; physical-sale egg amounts use `PIECE` and must also
resolve to a whole number.

Purchase, adjustment, and physical-sale writes use `amount` and `amountUnit`:

```json
{
  "items": [{
    "productVariantId": "uuid",
    "amount": "1.25",
    "amountUnit": "KG",
    "unitBuyingCost": "65.00"
  }],
  "purchaseDate": "2026-08-15"
}
```

Valid units are `PIECE` for packaged products, `KG`/`G` for loose weight, and
`LITER`/`ML` for loose volume. Kg/litre accept up to three decimal places;
piece/gram/ml inputs must resolve to whole base units. The API stores exact
pieces, grams, or millilitres and treats prices/costs as rates per piece, kg,
or litre. Incompatible units and overselling are rejected transactionally.

Physical-sale creation accepts `paymentMode: "PAID_NOW" | "CREDIT"`. Credit
sales require an existing or explicitly new credit customer and a date-only
`nextFollowUpDate` that is today or later in `Asia/Dhaka`. They are stored as
`COMPLETED + CREDIT + UNPAID`; FIFO stock, recognized revenue, and gross profit
are recorded at completion exactly like an immediately paid sale.
Phone is optional. The owner may send `finalProductTotal` as a BDT string to
record the actual product amount; otherwise the server uses current catalog
prices. The server derives `discountTotal` or `priceIncreaseTotal`, allocates
the difference to sale items, and requires `confirmPriceIncrease: true` for an
amount above catalog price. Legacy `discountTotal` requests remain supported,
but cannot be combined with `finalProductTotal`.

For an earlier physical sale, include `soldOn` (`YYYY-MM-DD`, within the past
90 Dhaka days), the actual `finalProductTotal`, and a UUID `idempotencyKey`.
The sale date is descriptive; `completedAt` remains the recording time used for
FIFO allocation, revenue, analytics, and oldest-first credit payment allocation.
Retrying the same key and payload returns the existing sale without consuming
stock again. Returns use the adjusted per-item amount. A forgotten earlier
payment is entered separately in the customer-level payment ledger.

Credit payment input uses a UUID idempotency key:

```json
{
  "idempotencyKey": "uuid",
  "amount": "500.00",
  "paidOn": "2026-08-22",
  "note": "Optional note"
}
```

Amounts must be positive, cannot exceed the current outstanding balance, and
cannot use a future payment date. Payment rows are immutable; an incorrect row
is voided with an audited reason. Concurrent collection writes lock the sale and
run in a serializable transaction. A return reduces unpaid balance first, then
reports only any excess as a cash refund. Repayments never create revenue or
profit again.

## Unified orders

All order sources use `sales_orders`, `sales_order_items`, and
`order_allocations`: `WEBSITE`, `PHYSICAL_SHOP`, `FACEBOOK`, `PHONE`,
`WHATSAPP`, and `OTHER`.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/delivery-rates` | Public | Active delivery zones and approved charges only |
| `GET` | `/api/v1/admin/delivery-rates` | OWNER | All delivery zones, including inactive/unpriced rows |
| `PATCH` | `/api/v1/delivery-rates/:id` | OWNER | Edit name, nullable charge, or active state |
| `POST` | `/api/v1/orders/website` | Guest or customer | Idempotent website COD checkout |
| `GET` | `/api/v1/orders/my` | CUSTOMER/active profile | Own profile-linked WEBSITE orders only |
| `POST` | `/api/v1/orders/manual` | OWNER | Facebook/phone/WhatsApp/other delivery order |
| `GET` | `/api/v1/orders` | OWNER | Unified paginated/filterable order list |
| `PATCH` | `/api/v1/orders/:id/status` | OWNER | Confirm/process/deliver/cancel/fail/return |
| `GET` | `/api/v1/physical-sales` | OWNER | Find physical sales using combinable `product`, general `query` (customer, phone, sale number, exact total), or Dhaka date range filters |
| `POST` | `/api/v1/physical-sales/:id/returns` | OWNER | Return selected items/quantities from an identified physical sale |

Website checkout accepts only variant IDs, quantities, customer delivery data,
delivery-rate ID, and an idempotency key:

```json
{
  "items": [{ "productVariantId": "uuid", "quantity": 2 }],
  "customer": {
    "name": "Guest",
    "phone": "01700000000",
    "address": "Complete address"
  },
  "deliveryRateId": "uuid",
  "idempotencyKey": "browser-generated-unique-key"
}
```

The strict schema rejects prices, costs, profit, totals, coupon values, and
payment choices. Express reloads active variants and the delivery rate. A
matching repeated key replays the original order; reuse with changed content
returns `IDEMPOTENCY_KEY_REUSED`.

Website and manual delivery-order APIs reject loose products. Loose products
can be sold only through `/api/v1/physical-sales`.

Manual delivery order additionally accepts `source`, `initialStatus` (`PENDING`
or `CONFIRMED`), optional `finalProductTotal`, and `confirmUnprofitable`.
`finalProductTotal` changes only the product amount; the selected delivery charge
is added separately. An increase requires `confirmPriceIncrease: true`; a
projected loss requires the existing explicit confirmation. Legacy
`discountTotal` remains supported but cannot be combined with
`finalProductTotal`. Manual orders cannot be backdated in V1.

Status actions:

```json
{ "action": "CONFIRM", "confirmUnprofitable": false }
{ "action": "PROCESS" }
{ "action": "DELIVER" }
{ "action": "CANCEL", "reason": "Customer asked" }
{ "action": "FAILED_DELIVERY", "reason": "Customer unreachable" }
{ "action": "RETURN", "condition": "SELLABLE", "reason": "Whole order returned" }
```

`reason` is optional for `CANCEL`, `FAILED_DELIVERY`, and `RETURN`. If omitted,
the API stores `অর্ডার বাতিল`, `ডেলিভারি ব্যর্থ`, or `পণ্য ফেরত`
respectively. Physical-sale returns follow the same rule and store
`দোকানের বিক্রি ফেরত` when no explanation is supplied. This does not make
stock-adjustment, incorrect-payment-void, owner-status, promotion, or demotion
reasons optional; those remain required because they explain sensitive manual
changes.

- `PENDING` holds no stock.
- `CONFIRM` reserves oldest available batches and variant totals atomically.
- `DELIVER` consumes reservations, marks COD paid, and recognizes captured
  revenue/cost/profit.
- cancellation/failure releases reservations and clears recognized costs/profit.
- whole delivery-order SELLABLE return creates cost-preserving return batches; DAMAGED return
  restores no stock. Both return statuses reverse recognition in reporting while
  retaining original snapshots.
- physical-shop returns must use `/physical-sales/:id/returns`. The request
  includes `condition`, an optional `reason`, and one or more original sale-item
  IDs with `amount` and `amountUnit`. Refund and reversed FIFO cost are calculated
  from captured snapshots. Cumulative returns cannot exceed the sold quantity.
- delivery-rate and order mutations write append-only audit rows transactionally.

List filters: `source`, `status`, ISO `dateFrom`, ISO `dateTo`, `orderNumber`,
`phone`, `page`, and `limit`.

## OWNER analytics

`GET /api/v1/analytics/dashboard` requires an active `OWNER` profile and returns
the full dashboard in one response. Supported query forms:

```text
?preset=today
?preset=yesterday
?preset=week
?preset=month
?preset=year
?preset=custom&from=2026-08-01&to=2026-08-31
```

Custom dates are inclusive, validated `YYYY-MM-DD` values, must be ordered, and
may span at most 366 days. All boundaries use `Asia/Dhaka`; weeks run Sunday
through Saturday. Week, month, and year presets use the elapsed period through
today and compare it with the equivalent elapsed period. Custom ranges compare
with the immediately preceding range of the same length. The response contains
current/previous ranges, compared summary metrics, all six sources, best-selling
and most-profitable variants, current inventory/alerts, and pending COD counts.

`trendGranularity` is `DAY` for ranges up to 62 days and `MONTH` for longer
ranges. Each `trend` item contains a `current` bucket and its paired `previous`
bucket. Every bucket includes `from`, `to`, `recognizedSales`, and `grossProfit`,
so the frontend can compare either metric while showing the actual date ranges.

Financial rules:

- physical sales contribute on `completed_at`; delivery orders contribute on
  `delivered_at`
- total recognized sales use the captured order `grand_total`
- product revenue is captured `subtotal - discount_total + price_increase_total`
- gross profit is product revenue minus exact FIFO allocation costs
- delivery charge contributes to total recognized sales but not product profit
- sellable and damaged whole delivery returns add equal negative financial,
  quantity, and FIFO-cost events on `returned_at`; identified physical-sale item
  returns add proportional negative events on their own `created_at`. Neither
  rewrites the original sale day
- FIFO inventory value is the remaining quantity times its buying-cost rate;
  gram/millilitre quantities are divided by 1,000 before applying the kg/litre rate
- quantity summaries are separate for pieces, kg, and litres and are never
  combined into a misleading unit total
- margin is `gross_profit / product_revenue × 100`, or `null` when product
  revenue is zero
- authoritative BDT money uses PostgreSQL/Prisma decimal values with two decimal
  places; proportional line discounts/increases preserve the exact transaction
  total, and displayed percentages round half-up

## Image upload

`POST /api/v1/upload` and `/api/v1/upload/multiple` require an active
OWNER Supabase profile. They accept JPEG, PNG, WebP, or AVIF only; each file is
limited to 5 MB and a multiple request is limited to 10 files. Files upload to
the fixed `nafah-agro` Cloudinary folder. Success uses the standard envelope:

```json
{ "success": true, "data": { "urls": ["https://res.cloudinary.com/..."] } }
```

Product records currently retain secure URLs. Remote orphan cleanup is manual
in V1; product deactivation does not delete a Cloudinary asset.

Unknown `/api/*` requests return a JSON `API_NOT_FOUND` response. Vercel never
rewrites them to the frontend SPA.

## Shop payment methods

Paid-now physical sales accept an optional `paymentChannel`: `CASH`, `BKASH`,
`NAGAD`, `ROCKET`, or `BANK`. Omitted means `CASH`. A credit sale has no
method until money is collected. Customer-level and legacy credit payment
requests accept their own optional `paymentChannel` (default `CASH`).
Physical returns accept an optional `refundChannel` for actual money paid
back; reducing unpaid debt is not a payout and has no refund method.

All correction requests below are OWNER-only and accept
`{ "paymentChannel": "BKASH" }`. They change only the method and append an
audit record with the actor, old and new methods, and timestamp:

- `PATCH /api/v1/physical-sales/:id/payment-channel`
- `PATCH /api/v1/physical-sales/:id/returns/:returnId/refund-channel`
- `PATCH /api/v1/credit-customers/:id/payments/:paymentId/payment-channel`
- `PATCH /api/v1/credit-sales/:id/payments/:paymentId/payment-channel`

The dashboard response includes `paymentChannels`, with `method`,
`received`, `refunded`, and `net` for each of the five methods. Paid-now
shop sales use actual `soldOn`; active credit collections use `paidOn`;
return payouts use the recorded return date. Voided payments, allocation
rows, and delivery COD are excluded. Older method-free records are treated as
cash. These selected-period flows are not current cash, wallet, or bank
balances. Existing sales and profit accounting dates remain unchanged.
