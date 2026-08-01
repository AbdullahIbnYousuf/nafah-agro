# Nafah Agro

Nafah Agro is a React/Vite storefront with an Express API. Supabase Auth and
PostgreSQL/Prisma now power identity, roles, categories, products, variants,
selling prices, and price history. The old MongoDB order flow remains temporary
so guest checkout can continue while the order vertical is rebuilt.

## Current status

- Roles: `OWNER`, `ADMIN`, `CUSTOMER`; roles come only from PostgreSQL profiles.
- Login, logout, registration, browser session restoration, and protected routes
  use Supabase Auth.
- Public admin setup, unlock codes, moderator accounts, and custom JWTs are gone.
- Storefront product/category reads and admin catalog writes use `/api/v1` and
  PostgreSQL.
- A product is created with an initial variant and selling-price-history row in
  one transaction. Subsequent selling-price changes append history atomically.
- OWNER/ADMIN catalog screens can create/edit/activate/deactivate variants,
  enforce unique normalized SKUs, inspect price history, and update one or many
  selling prices. Bulk price changes are all-or-nothing.
- Product-variant stock totals exist but cannot yet be populated; FIFO starts in
  Milestone 3.
- Guest checkout still posts to the temporary MongoDB order route.
- No deployment was performed as part of this change.

## Requirements

- Node.js `>=22.12 <23`
- npm `>=10`
- Supabase project with Auth and PostgreSQL
- MongoDB only while the legacy order routes remain
- Cloudinary only when testing product image upload

## Local setup

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

Frontend defaults to Vite's local URL; Express defaults to port `4000`. Configure
`VITE_API_URL` to point to the API when the Vite proxy is not used.

## Environment variables

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `MONGO_URI` | backend | Temporary legacy order creation/history/management only |
| `FRONTEND_URL` | backend | Exact CORS origin |
| `DATABASE_URL` | backend | Pooled Supabase PostgreSQL runtime URL |
| `DIRECT_URL` | CLI only | Direct PostgreSQL migration/seed URL |
| `SUPABASE_URL` | backend | Supabase issuer/JWKS URL |
| `SUPABASE_JWT_AUDIENCE` | backend | Usually `authenticated` |
| `VITE_SUPABASE_URL` | public frontend | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | public frontend | Publishable/anon key; never service-role |
| `VITE_API_URL` | public frontend | API base, default `/api` |
| `CLOUDINARY_CLOUD_NAME` | backend | Optional image service setting |
| `CLOUDINARY_API_KEY` | backend | Optional image service credential |
| `CLOUDINARY_API_SECRET` | backend | Optional secret; never expose to Vite |
| `PROTECTED_RATE_LIMIT_MAX` | backend | Protected requests per IP/window |
| `RATE_LIMIT_WINDOW_MS` | backend | Rate-limit window |
| `JSON_BODY_LIMIT` | backend | JSON request limit |

## Supabase setup

1. Create a Supabase project and copy the PostgreSQL URLs, project URL, and
   publishable/anon key into `.env`.
2. Apply the checked-in migrations (do not use `prisma db push`):

```bash
DATABASE_URL="postgresql://...pooler..." DIRECT_URL="postgresql://...direct..." \
  npx prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL="postgresql://...pooler..." DIRECT_URL="postgresql://...direct..." \
  npm run seed
```

Use Supabase's direct/session connection for `DIRECT_URL`; use the transaction
pooler for the deployed API's `DATABASE_URL`. The seed only upserts the
idempotent foundation record.

3. Create the first owner in Supabase Auth without `nafah_role` metadata, copy
   the Auth UUID, then run:

```bash
npm run owner:create -- --user-id UUID --full-name "Owner Name" --phone 01XXXXXXXXX --confirm
```

There is intentionally no public owner/admin registration endpoint. Customer
sign-up sends `full_name`, the required `phone_number`, and a
`nafah_role=CUSTOMER` marker. The database trigger ignores privileged role
requests and inserts only `CUSTOMER`. If that profile is missing after Auth
signup, the next verified session can recover only its own CUSTOMER profile from
the token metadata; it cannot create or modify an OWNER/ADMIN profile.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run build:server
npm run prisma:validate
```

See [API.md](API.md) for routes and [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md)
for verified results and remaining work.
