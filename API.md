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

Owner invitations require the backend-only `SUPABASE_SERVICE_ROLE_KEY`. Public
registration always creates `CUSTOMER`; metadata can never grant OWNER. The CLI
workflow remains the bootstrap/recovery path for the first owner.

## Catalog and inventory

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/categories` | Public | Active categories |
| `GET` | `/api/v1/admin/categories` | OWNER | All categories |
| `POST/PATCH` | `/api/v1/categories`, `/categories/:id` | OWNER | Create/edit/activate category |
| `GET` | `/api/v1/products`, `/products/:slug` | Public | Active storefront catalog |
| `GET` | `/api/v1/admin/products` | OWNER | Full catalog |
| `POST/PATCH` | `/api/v1/products`, `/products/:id` | OWNER | Create/edit product |
| `POST/PATCH` | `/api/v1/products/:id/variants`, `/variants/:id` | OWNER | Create/edit variant and unique SKU |
| `PATCH` | `/api/v1/variants/:id/selling-price` | OWNER | Single price change/history append |
| `POST` | `/api/v1/variants/selling-prices/bulk` | OWNER | Atomic bulk price change |
| `GET` | `/api/v1/variants/:id/price-history` | OWNER | Immutable price history |
| `GET` | `/api/v1/stock-batches` | OWNER | FIFO batches and costs |
| `POST` | `/api/v1/purchases` | OWNER | Atomic multi-item purchase |
| `POST` | `/api/v1/stock-adjustments` | OWNER | Reason-required increase/decrease |
| `POST/GET` | `/api/v1/physical-sales` | OWNER | Immediate FIFO CASH sale/list |

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
- whole sellable return creates cost-preserving return batches; damaged return
  restores no stock. Both return statuses reverse recognition in reporting while
  retaining original snapshots.
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
- sellable and damaged whole returns add equal negative financial, quantity,
  and FIFO-cost events on `returned_at`; they do not rewrite the original day
- FIFO inventory value is `(available_quantity + reserved_quantity) ×
  unit_buying_cost` across remaining batches
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
