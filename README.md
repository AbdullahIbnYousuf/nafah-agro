# Nafah Agro

Nafah Agro is a React/Vite storefront and Express API backed by Supabase Auth,
PostgreSQL, and Prisma. The current V1 code supports catalog/pricing, FIFO
inventory, physical-shop sales, guest website COD, manual delivery orders, and a
single order lifecycle across every sales source.

## Current features

- Active application roles are `OWNER` and `CUSTOMER`, resolved from active
  PostgreSQL profiles after Supabase token verification. Multiple owners are allowed.
- Public storefront reads active PostgreSQL categories, products, and variants.
- OWNER profiles manage products, unique SKUs, immutable selling-price history,
  purchases, stock adjustments, FIFO batches, and physical CASH sales.
- Guest and registered customers can place website COD orders. Checkout sends
  variant IDs and quantities only; Express reloads all prices and delivery rates.
- Website orders start `PENDING` without stock reservation. An OWNER
  confirmation reserves exact FIFO batches; delivery consumes reservations;
  cancellation or failed delivery releases them.
- OWNER profiles can create Facebook, phone, WhatsApp, or other delivery orders as
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

The API defaults to port `4000`. Vite proxies same-origin `/api` requests to that
port, so no frontend API URL is required. `VITE_API_URL` is an optional local-only
override for intentionally bypassing the proxy.

## Environment variables

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | backend | Pooled Supabase PostgreSQL runtime URL |
| `DIRECT_URL` | CLI only | Direct/session URL for migrations and seeds |
| `SUPABASE_URL` | backend | Supabase issuer and JWKS base URL |
| `SUPABASE_JWT_AUDIENCE` | backend | Usually `authenticated` |
| `SUPABASE_SERVICE_ROLE_KEY` | backend only | Required for an OWNER to invite additional owners; never expose to Vite |
| `VITE_SUPABASE_URL` | public frontend | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | public frontend | Publishable/anon key; never service-role |
| `VITE_API_URL` | optional public frontend | Local override; defaults to same-origin `/api` and should be unset on Vercel |
| `CLOUDINARY_CLOUD_NAME` | backend | Optional image-service setting |
| `CLOUDINARY_API_KEY` | backend | Optional image-service credential |
| `CLOUDINARY_API_SECRET` | backend | Optional secret; never expose through Vite |
| `PROTECTED_RATE_LIMIT_MAX` | backend | Protected requests per IP/window |
| `OWNER_INVITE_RATE_LIMIT_MAX` | backend | Owner invitation attempts per IP/window; defaults to 5 |
| `RATE_LIMIT_WINDOW_MS` | backend | Rate-limit window |
| `JSON_BODY_LIMIT` | backend | JSON request-size limit |

`NODE_ENV=production` and `JSON_BODY_LIMIT=100kb` are the intended Vercel
runtime values. Production does not use cross-origin requests, so neither
`FRONTEND_URL` nor `CLIENT_URL` is accepted or required.

## Single-project Vercel target

The repository deploys as one Vercel project: Vite serves `/`, the shared
Express app is exported by `api/index.ts`, and `vercel.json` forwards
`/api/(.*)` to that Function without injecting a named query parameter.
Every application API route is under `/api/v1`; `/api` is excluded from the
React Router fallback, so unknown API requests stay JSON 404 responses.

Use Vite preset, repository root, Node.js 22.x, `npm ci`, `npm run build`, and
`dist`. Do not set `VITE_API_URL` or a backend URL. See
[deployment_guide.md](deployment_guide.md) for the exact dashboard values and
smoke checks.

## Supabase setup

Apply checked-in migrations; do not use `prisma db push`:

```bash
DATABASE_URL="postgresql://...pooler..." DIRECT_URL="postgresql://...direct..." \
  npx prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL="postgresql://...pooler..." DIRECT_URL="postgresql://...direct..." \
  npm run seed
```

The two-role migration intentionally stops if it finds a historical `ADMIN`
profile instead of silently changing that user's privileges. Resolve any such
row deliberately before rerunning `prisma migrate deploy`.

The Milestone 4 migration inserts `Dhaka` and `Outside Dhaka` delivery-rate rows
with `NULL` charges intentionally. Before checkout testing, an OWNER must
set approved charges from the admin order screen.

Create a user in Supabase Auth, copy its UUID, then grant that identity an owner
profile through the controlled command:

```bash
npm run owner:create -- --user-id UUID --full-name "Owner Name" --phone 01XXXXXXXXX --confirm
```

Repeat the command with a different Auth UUID to create additional owners. It
never upgrades an existing customer profile, and the database blocks deleting,
deactivating, or demoting the final active owner. There is no public OWNER
registration endpoint. Customer registration requires phone metadata and can
create only a `CUSTOMER` profile.

After the first owner can sign in, `/profile` provides the normal workflow for
inviting and activating/deactivating additional owners. Configure the backend-only
`SUPABASE_SERVICE_ROLE_KEY`, Supabase Site URL, approved redirect URLs, and SMTP
before testing email invitations. The invite workflow creates a distinct Auth
identity and OWNER profile, records an audit log, blocks self-deactivation, and
requires a reason for status changes. An invited owner is redirected to the
profile screen and must set an initial password before using the rest of the app.

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
