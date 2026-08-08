# Nafah Agro

Nafah Agro V1 is a Bangla storefront and sales-management application for an
organic-food SME. One React/Vite application serves customers and owners; one
Express API handles Supabase authentication, PostgreSQL/Prisma data, FIFO stock,
orders, returns, analytics, and Cloudinary uploads.

## V1 capabilities

- Public catalog with categories, products, sellable variants, search/filtering,
  a local cart, and guest cash-on-delivery checkout.
- Optional CUSTOMER registration, profile maintenance, and website-order history.
- Controlled multiple-OWNER access, owner invitations, deletion of accounts
  with no business or audit history, and protection for the final active owner.
- Product, unique-SKU, price-history, purchase, FIFO inventory, stock-adjustment,
  physical-sale, delivery-order, whole-return, and delivery-rate management.
- OWNER-only permanent deletion for empty categories and products with no stock,
  adjustment, order, or selling-price update history; used catalog records
  remain deactivate-only.
- OWNER analytics for recognized sales, product revenue, delivery charges, FIFO
  gross profit, returns, sources, rankings, open COD work, and inventory value.
- One-project Vercel routing: the frontend uses `/`; every API route uses
  same-origin `/api/v1/*`.

## Local setup

Requirements: Node.js `>=22.12 <23`, npm `>=10`, a Supabase project, and
Cloudinary credentials.

```bash
npm ci
cp .env.example .env
npm run prisma:generate
npx prisma migrate deploy --schema prisma/schema.prisma
npm run seed
```

Run the API and Vite in separate terminals:

```bash
npm run server
npm run dev
```

Vite listens on `http://localhost:8080` and proxies `/api` to
`http://localhost:4000`. The browser always calls same-origin `/api`; there is no
separate frontend API-origin setting.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | backend/Vercel | Supabase pooled PostgreSQL runtime URL |
| `SUPABASE_URL` | backend/Vercel | Auth issuer and JWKS base URL |
| `SUPABASE_JWT_AUDIENCE` | backend/Vercel | Normally `authenticated` |
| `SUPABASE_SERVICE_ROLE_KEY` | backend/Vercel | Additional-owner email invitations; required in production and never exposed to Vite |
| `VITE_SUPABASE_URL` | public frontend | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | public frontend | Supabase publishable/anon key |
| `CLOUDINARY_CLOUD_NAME` | backend/Vercel | Cloudinary account |
| `CLOUDINARY_API_KEY` | backend/Vercel | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | backend/Vercel | Cloudinary secret; never expose to Vite |
| `JSON_BODY_LIMIT` | backend/Vercel, optional | JSON body limit; default `100kb` |
| `RATE_LIMIT_WINDOW_MS` | backend, optional | In-memory rate-limit window |
| `PROTECTED_RATE_LIMIT_MAX` | backend, optional | Protected requests per IP/window; default `300` |
| `OWNER_INVITE_RATE_LIMIT_MAX` | backend, optional | Owner invitations per IP/window |
| `DIRECT_URL` | protected CLI/CI only | Direct/session URL for migrations, seeds, and owner commands |

Production startup fails fast when database, Supabase Auth administration, or
Cloudinary runtime configuration is missing. Vercel supplies production mode
automatically.

## Database and owners

Apply checked-in migrations; never use `prisma db push` against shared data:

```bash
DATABASE_URL="postgresql://...pooler..." DIRECT_URL="postgresql://...direct..." \
  npx prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL="postgresql://...pooler..." DIRECT_URL="postgresql://...direct..." \
  npm run seed
```

`npm run seed` is idempotent and only upserts a foundation marker. The separate
demo reset is destructive, refuses to start without its explicit confirmation
token, and must never be run against production.

For an existing showcase dataset, refresh only the three known demo sales into
the current dashboard period without creating, deleting, or repricing anything:

```bash
CONFIRM_DASHBOARD_DEMO=REFRESH_NAFAH_DASHBOARD_DEMO npm run seed:dashboard-demo
```

The command aborts unless `PHY-DEMO-1001`, `PHY-DEMO-1002`, and
`WEB-DEMO-1003` still have their expected demo source and status. It updates
only their order/allocation timestamps and is safe to rerun for demonstrations.

Create a Supabase Auth identity, copy its UUID, and bootstrap or recover OWNER
access with:

```bash
npm run owner:create -- --user-id UUID --full-name "Owner Name" --phone 01XXXXXXXXX --confirm
```

After bootstrap, an active owner can invite another owner from `/profile` when
the backend service-role key, SMTP, Site URL, and redirect URLs are configured.
Another owner may permanently delete an unused owner account with no business
or audit references; used accounts remain available for deactivation only.
Public registration can only create CUSTOMER profiles.

An OWNER may also permanently delete an empty category or a product that has
never appeared in inventory, a stock adjustment, an order, or a selling-price
update. Product setup
variants and price-history rows are removed in the same transaction. Cloudinary
files are retained for manual orphan review. Apply all checked-in migrations
before using this workflow.

Check cached stock totals against authoritative batches with:

```bash
npm run inventory:check
```

## Verification and release

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

On a host where Playwright cannot install its bundled Chromium but Chrome is
already present, run browser checks with
`PLAYWRIGHT_CHROME_PATH=/path/to/google-chrome npx playwright test`.

- [API.md](API.md) documents API contracts and financial rules.
- [deployment_guide.md](deployment_guide.md) gives exact Vercel/Supabase staging steps.
- [docs/OPERATIONS.md](docs/OPERATIONS.md) covers backups, access recovery,
  rollback, rate-limit limitations, and record investigation.
- [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) is the client-demo and
  production acceptance checklist.
- [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) records verified and external work.
