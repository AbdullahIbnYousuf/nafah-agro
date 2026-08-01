# Nafah Agro

Nafah Agro is a React/Vite storefront and Express API backed by Supabase Auth,
PostgreSQL, and Prisma. The current V1 code supports catalog/pricing, FIFO
inventory, physical-shop sales, guest website COD, manual delivery orders, and a
single order lifecycle across every sales source.

## Current features

- Roles are `OWNER`, `ADMIN`, and `CUSTOMER`, resolved from active PostgreSQL
  profiles after Supabase token verification.
- Public storefront reads active PostgreSQL categories, products, and variants.
- OWNER/ADMIN manage products, unique SKUs, immutable selling-price history,
  purchases, stock adjustments, FIFO batches, and physical CASH sales.
- Guest and registered customers can place website COD orders. Checkout sends
  variant IDs and quantities only; Express reloads all prices and delivery rates.
- Website orders start `PENDING` without stock reservation. OWNER/ADMIN
  confirmation reserves exact FIFO batches; delivery consumes reservations;
  cancellation or failed delivery releases them.
- OWNER/ADMIN can create Facebook, phone, WhatsApp, or other delivery orders as
  pending or confirmed, and manage every source from one screen.
- Whole sellable returns restore stock at captured costs. Whole damaged returns
  do not restore stock. Return status supplies the reversal signal while original
  price/cost snapshots remain immutable for later reporting.
- Order/rate changes write actor, before/after state, and reasons to append-only
  PostgreSQL audit logs in the same transaction.
- MongoDB, Mongoose, legacy order routes, fake coupons, and fake online-payment
  choices have been removed. No deployment was performed.

## Requirements and local setup

- Node.js `>=22.12 <23`
- npm `>=10`
- Supabase project with Auth and PostgreSQL
- Cloudinary credentials only for image upload

```bash
npm install
cp .env.example .env
npm run prisma:generate
npx prisma migrate deploy --schema prisma/schema.prisma
npm run seed
npm run dev
```

In a second terminal:

```bash
npm run server
```

The API defaults to port `4000`. `VITE_API_URL=/api` works with the checked-in
Vite/Vercel routing; set a full API URL when running the two processes without a
proxy.

## Environment variables

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `FRONTEND_URL` | backend | Exact allowed CORS origin |
| `DATABASE_URL` | backend | Pooled Supabase PostgreSQL runtime URL |
| `DIRECT_URL` | CLI only | Direct/session URL for migrations and seeds |
| `SUPABASE_URL` | backend | Supabase issuer and JWKS base URL |
| `SUPABASE_JWT_AUDIENCE` | backend | Usually `authenticated` |
| `VITE_SUPABASE_URL` | public frontend | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | public frontend | Publishable/anon key; never service-role |
| `VITE_API_URL` | public frontend | API base, normally `/api` |
| `CLOUDINARY_CLOUD_NAME` | backend | Optional image-service setting |
| `CLOUDINARY_API_KEY` | backend | Optional image-service credential |
| `CLOUDINARY_API_SECRET` | backend | Optional secret; never expose through Vite |
| `PROTECTED_RATE_LIMIT_MAX` | backend | Protected requests per IP/window |
| `RATE_LIMIT_WINDOW_MS` | backend | Rate-limit window |
| `JSON_BODY_LIMIT` | backend | JSON request-size limit |

## Supabase setup

Apply checked-in migrations; do not use `prisma db push`:

```bash
DATABASE_URL="postgresql://...pooler..." DIRECT_URL="postgresql://...direct..." \
  npx prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL="postgresql://...pooler..." DIRECT_URL="postgresql://...direct..." \
  npm run seed
```

The Milestone 4 migration inserts `Dhaka` and `Outside Dhaka` delivery-rate rows
with `NULL` charges intentionally. Before checkout testing, an OWNER/ADMIN must
set approved charges from the admin order screen.

Create the first user in Supabase Auth, copy its UUID, then create the owner
profile through the controlled command:

```bash
npm run owner:create -- --user-id UUID --full-name "Owner Name" --phone 01XXXXXXXXX --confirm
```

There is no public OWNER/ADMIN registration endpoint. Customer registration
requires phone metadata and can create only a `CUSTOMER` profile.

## Verification

```bash
npm run typecheck
npm run lint
npm test -- --run
npm run build
npm run build:server
npm run prisma:validate
npm run prisma:generate
git diff --check
```

See [API.md](API.md) for routes and
[docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for external acceptance work.
