# Nafah Agro API

Base URL: `/api`. New endpoints are versioned under `/api/v1`. JSON v1 success
responses use `{ "success": true, "data": ... }`; errors use
`{ "success": false, "error": { "code", "message", "details" } }`.

## Authentication and roles

The browser signs in, signs out, and registers directly through Supabase Auth.
Express does not issue custom JWTs. Protected API calls send:

```http
Authorization: Bearer SUPABASE_ACCESS_TOKEN
```

Express verifies the Supabase signature/issuer/audience, loads the matching
PostgreSQL `profiles` row, rejects missing or inactive profiles, and then checks
`OWNER`, `ADMIN`, or `CUSTOMER`. Supabase user metadata is not authorization
data. There is no public owner or admin creation API.

### Profile

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/auth/me` | Active profile | Resolve token to application profile |
| `POST` | `/api/v1/auth/complete-customer-profile` | Valid Supabase token | Recover only the token subject's missing CUSTOMER profile from verified token name/phone metadata |

### Health/foundation

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/health` | Public | API and PostgreSQL readiness |
| `GET` | `/api/v1/foundation` | Active profile | Foundation proof of concept |
| `GET` | `/api/v1/foundation/admin` | OWNER/ADMIN | Role proof |
| `GET` | `/api/v1/foundation/owner` | OWNER | Owner-only proof |

## PostgreSQL catalog

### Categories

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/categories` | Public | Active categories |
| `GET` | `/api/v1/admin/categories` | OWNER/ADMIN | All active and inactive categories |
| `POST` | `/api/v1/categories` | OWNER/ADMIN | Create category |
| `PATCH` | `/api/v1/categories/:id` | OWNER/ADMIN | Edit or deactivate category |

### Products and variants

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/products` | Public | Paginated active products |
| `GET` | `/api/v1/admin/products` | OWNER/ADMIN | Paginated products including inactive products/variants |
| `GET` | `/api/v1/products/:slug` | Public | Product detail |
| `POST` | `/api/v1/products` | OWNER/ADMIN | Product + first variant + first price-history row |
| `PATCH` | `/api/v1/products/:id` | OWNER/ADMIN | Edit/deactivate product metadata |
| `POST` | `/api/v1/products/:id/variants` | OWNER/ADMIN | Add a variant and initial price-history row |
| `PATCH` | `/api/v1/variants/:id` | OWNER/ADMIN | Edit SKU/name/threshold/default/active state |
| `PATCH` | `/api/v1/variants/:id/selling-price` | OWNER/ADMIN | Change current selling price and append history |
| `GET` | `/api/v1/variants/:id/price-history` | OWNER/ADMIN | Selling-price audit history |
| `POST` | `/api/v1/variants/selling-prices/bulk` | OWNER/ADMIN | Atomically change two–100 variant prices with one reason |

`POST /products` requires `name`, `slug`, `categoryId`, `initialVariant`
(`name`, unique `sku`, decimal-string `sellingPrice`), and `priceReason`.
Stock totals start at zero; no catalog endpoint directly edits stock.

SKUs are uppercased and unique across all variants. A product always starts with
one active default variant. The API prevents deactivating the last active
variant and always keeps an active default. Public reads hide inactive
categories, products, and variants. PostgreSQL prevents update/delete of
selling-price-history rows.

Product list query parameters: `query`, category slug in `category`, `tag`,
`featured`, `minPrice`, `maxPrice`, `sort`, `page`, and `limit` (maximum 100).

## Temporary MongoDB routes

These routes are explicitly legacy and unversioned. MongoDB catalog routes and
models have been removed; the active frontend has no compatibility catalog API.

| Method | Endpoint | Access | Status |
| --- | --- | --- | --- |
| `POST` | `/api/orders` | Public guest checkout | Temporary order creation |
| `GET` | `/api/orders/my` | Active profile | Temporary account order history |
| `GET/PATCH` | `/api/orders/...` | OWNER/ADMIN | Temporary order management |
| `POST` | `/api/upload`, `/api/upload/multiple` | OWNER/ADMIN | Supabase-protected Cloudinary upload |

Every Mongo catalog route and every `/api/auth/*` legacy route was removed. The
remaining Mongo order routes/model are the only reason `MONGO_URI` is required.
