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
| `GET` | `/api/v1/owners` | OWNER | List owner profiles and Auth invitation/sign-in state |
| `POST` | `/api/v1/owners/invitations` | OWNER | Send a Supabase email invitation and create an OWNER profile |
| `PATCH` | `/api/v1/owners/:id/status` | OWNER | Reason-required activate/deactivate; self/final-owner protected |
| `DELETE` | `/api/v1/owners/:id` | OWNER | Permanently delete another owner only when no business or audit history exists |

Owner invitations require the backend-only `SUPABASE_SERVICE_ROLE_KEY`. Public
registration always creates `CUSTOMER`; metadata can never grant OWNER. The CLI
workflow remains the bootstrap/recovery path for the first owner.

## Catalog and inventory

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/categories` | Public | Active categories |
| `GET` | `/api/v1/admin/categories` | OWNER | All categories |
| `POST/PATCH` | `/api/v1/categories`, `/categories/:id` | OWNER | Create/edit/activate category |
| `DELETE` | `/api/v1/categories/:id` | OWNER | Permanently delete an empty category only |
| `GET` | `/api/v1/products`, `/products/:slug` | Public | Active storefront catalog |
| `GET` | `/api/v1/admin/products`, `/admin/products/:id` | OWNER | Full catalog list and direct product lookup, including inactive records |
| `POST/PATCH` | `/api/v1/products`, `/products/:id` | OWNER | Create/edit product |
| `PATCH` | `/api/v1/products/:id/kind` | OWNER | Correct an entirely unused product type |
| `DELETE` | `/api/v1/products/:id` | OWNER | Delete only a product with no stock, adjustment, order, or price-update history |
| `POST/PATCH` | `/api/v1/products/:id/variants`, `/variants/:id` | OWNER | Create/edit a pack/size; SKU is generated internally |
| `PATCH` | `/api/v1/variants/:id/selling-price` | OWNER | Single price change/history append |
| `POST` | `/api/v1/variants/selling-prices/bulk` | OWNER | Atomic bulk price change |
| `GET` | `/api/v1/variants/:id/price-history` | OWNER | Immutable price history |
| `GET` | `/api/v1/stock-batches` | OWNER | FIFO batches and costs |
| `POST` | `/api/v1/purchases` | OWNER | Atomic multi-item purchase |
| `POST` | `/api/v1/stock-adjustments` | OWNER | Reason-required increase/decrease |
| `POST/GET` | `/api/v1/physical-sales` | OWNER | Immediate FIFO CASH sale/list |

Admin category/product responses include `canDelete`, calculated by the API.
Deletion is transactional and rechecks eligibility server-side. A deleted
unused product also removes its setup variants and price-history rows; normal
price history remains immutable. Cloudinary image URLs are recorded in the
audit event, but remote image files are not deleted automatically.

Catalog write clients do not submit or edit SKU values. Express generates an
immutable internal SKU for each new variant. Existing SKU columns and historical
snapshots remain for compatibility but are not part of the owner or customer UI.
The initial pack/size name may be blank; an additional pack/size requires the
existing internal default to be given a meaningful name first.

Products expose `kind`: `PACKAGED`, `LOOSE_WEIGHT`, or `LOOSE_VOLUME`.
Loose products keep one hidden internal variant and cannot receive more
pack/size options. Public catalog endpoints return only `PACKAGED`; owner
catalog endpoints return every type. The kind-correction endpoint is rejected
after stock, purchases, adjustments, sales, or a real price change exists.

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
or `CONFIRMED`), owner-set `discountTotal`, and `confirmUnprofitable`. Discount may
not exceed subtotal. A loss requires explicit retry/confirmation.

Status actions:

```json
{ "action": "CONFIRM", "confirmUnprofitable": false }
{ "action": "PROCESS" }
{ "action": "DELIVER" }
{ "action": "CANCEL", "reason": "Customer asked" }
{ "action": "FAILED_DELIVERY", "reason": "Customer unreachable" }
{ "action": "RETURN", "condition": "SELLABLE", "reason": "Whole order returned" }
```

- `PENDING` holds no stock.
- `CONFIRM` reserves oldest available batches and variant totals atomically.
- `DELIVER` consumes reservations, marks COD paid, and recognizes captured
  revenue/cost/profit.
- cancellation/failure releases reservations and clears recognized costs/profit.
- whole delivery-order SELLABLE return creates cost-preserving return batches; DAMAGED return
  restores no stock. Both return statuses reverse recognition in reporting while
  retaining original snapshots.
- physical-shop returns must use `/physical-sales/:id/returns`. The request
  includes `condition`, a required `reason`, and one or more original sale-item
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
through Saturday. The response contains current/previous ranges, compared
summary metrics, daily trend, all six sources, best-selling and most-profitable
variants, current inventory/alerts, and pending COD counts.

Financial rules:

- physical sales contribute on `completed_at`; delivery orders contribute on
  `delivered_at`
- total recognized sales use the captured order `grand_total`
- product revenue is captured `subtotal - discount_total`
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
  places; proportional line discounts and displayed percentages round half-up
  (line discounts to 2 places, margins/comparisons to 2 displayed places)

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
