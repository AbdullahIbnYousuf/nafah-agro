# Nafah Agro API

Base URL: `/api`; application endpoints are under `/api/v1`. Successful v1
responses use `{ "success": true, "data": ... }`; errors use
`{ "success": false, "error": { "code", "message", "details" } }`.

Protected requests send `Authorization: Bearer SUPABASE_ACCESS_TOKEN`. Express
verifies the Supabase token, loads the active PostgreSQL profile, and enforces
`OWNER`, `ADMIN`, or `CUSTOMER`. User metadata never grants roles.

## Foundation and profiles

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/health` | Public | API/PostgreSQL readiness |
| `GET` | `/api/v1/auth/me` | Active profile | Resolve token to profile |
| `POST` | `/api/v1/auth/complete-customer-profile` | Supabase user | Recover only the token subject's CUSTOMER profile |
| `GET` | `/api/v1/foundation` | Active profile | PostgreSQL proof endpoint |
| `GET` | `/api/v1/foundation/admin` | OWNER/ADMIN | Role proof |
| `GET` | `/api/v1/foundation/owner` | OWNER | Owner-only proof |

## Catalog and inventory

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/categories` | Public | Active categories |
| `GET` | `/api/v1/admin/categories` | OWNER/ADMIN | All categories |
| `POST/PATCH` | `/api/v1/categories`, `/categories/:id` | OWNER/ADMIN | Create/edit/activate category |
| `GET` | `/api/v1/products`, `/products/:slug` | Public | Active storefront catalog |
| `GET` | `/api/v1/admin/products` | OWNER/ADMIN | Full catalog |
| `POST/PATCH` | `/api/v1/products`, `/products/:id` | OWNER/ADMIN | Create/edit product |
| `POST/PATCH` | `/api/v1/products/:id/variants`, `/variants/:id` | OWNER/ADMIN | Create/edit variant and unique SKU |
| `PATCH` | `/api/v1/variants/:id/selling-price` | OWNER/ADMIN | Single price change/history append |
| `POST` | `/api/v1/variants/selling-prices/bulk` | OWNER/ADMIN | Atomic bulk price change |
| `GET` | `/api/v1/variants/:id/price-history` | OWNER/ADMIN | Immutable price history |
| `GET` | `/api/v1/stock-batches` | OWNER/ADMIN | FIFO batches and costs |
| `POST` | `/api/v1/purchases` | OWNER/ADMIN | Atomic multi-item purchase |
| `POST` | `/api/v1/stock-adjustments` | OWNER/ADMIN | Reason-required increase/decrease |
| `POST/GET` | `/api/v1/physical-sales` | OWNER/ADMIN | Immediate FIFO CASH sale/list |

## Unified orders

All order sources use `sales_orders`, `sales_order_items`, and
`order_allocations`: `WEBSITE`, `PHYSICAL_SHOP`, `FACEBOOK`, `PHONE`,
`WHATSAPP`, and `OTHER`.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/delivery-rates` | Public | Active/inactive Dhaka rates and approved charge |
| `PATCH` | `/api/v1/delivery-rates/:id` | OWNER/ADMIN | Edit name, nullable charge, or active state |
| `POST` | `/api/v1/orders/website` | Guest or customer | Idempotent website COD checkout |
| `GET` | `/api/v1/orders/my` | CUSTOMER/active profile | Own profile-linked WEBSITE orders only |
| `POST` | `/api/v1/orders/manual` | OWNER/ADMIN | Facebook/phone/WhatsApp/other delivery order |
| `GET` | `/api/v1/orders` | OWNER/ADMIN | Unified paginated/filterable order list |
| `PATCH` | `/api/v1/orders/:id/status` | OWNER/ADMIN | Confirm/process/deliver/cancel/fail/return |

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
or `CONFIRMED`), admin `discountTotal`, and `confirmUnprofitable`. Discount may
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

## Image upload

`POST /api/v1/upload` and `/api/v1/upload/multiple` require an active
OWNER/ADMIN Supabase profile. They upload to Cloudinary.

Unknown `/api/*` requests return a JSON `API_NOT_FOUND` response. Vercel never
rewrites them to the frontend SPA.
