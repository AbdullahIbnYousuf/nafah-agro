# Nafah Agro

Nafah Agro V1 is a Bangla storefront and sales-management application for an
organic-food SME. One React/Vite application serves customers and owners; one
Express API handles Supabase authentication, PostgreSQL/Prisma data, FIFO stock,
orders, returns, analytics, and Cloudinary uploads.

## V1 capabilities

- Public catalog with categories, products, sellable pack/size options, search/filtering,
  a local cart, and guest cash-on-delivery checkout.
- Independent Active and Show controls for categories and packaged products.
  Category controls gate all children without erasing individual product choices;
  Hide affects the online shop while active hidden products remain usable in-store.
- Optional CUSTOMER registration, profile maintenance, shared OWNER/CUSTOMER
  email password recovery, and website-order history.
- Controlled multiple-OWNER access, new-email invitations, existing-customer
  promotion, safe reversal before owner activity, unused-invitation deletion,
  and protection for the final active owner.
- Product, pack/size, price-history, purchase, FIFO inventory, stock-adjustment,
  physical-sale, delivery-order, whole delivery-return, identified physical-sale
  item return, and delivery-rate management.
- Physical-shop `বাকি` sales with a required customer name, optional phone, date-based
  follow-up reminders, partial/full repayment history, payment correction, and
  return-aware outstanding balances.
- Editable final product totals for shop sales and manual delivery orders,
  with recorded discounts or extra charges. Owners can enter a forgotten shop
  sale from the past 90 days without rewriting earlier stock or dashboard data.
- Separate `PACKAGED`, loose-weight, and loose-volume products. Loose products
  are physical-shop-only, use exact gram/millilitre stock internally, and show
  owner inputs and balances in kg/g or litre/ml.
- Packaged products can name each whole selling unit, such as `বস্তা`, `ক্যান`,
  or `ট্রে`. Each pack/size keeps its own label, price, and FIFO stock; there is
  no conversion into kg or sale of part of a unit. Existing pack/sizes use `ইউনিট`.
- `EGG` products use one whole-piece FIFO stock pool and two server-enforced
  selling rates: the regular rate for 1–14 eggs and a lower rate for the whole
  line at 15 or more. Eggs are available in the storefront and every sales channel.
- OWNER-only permanent deletion for empty categories and products with no stock,
  adjustment, order, or selling-price update history; used catalog records
  remain deactivate-only.
- OWNER analytics for recognized sales, product revenue, delivery charges, FIFO
  gross profit, returns, sources, rankings, open COD work, and inventory value.
- One-project Vercel routing: the frontend uses `/`; every API route uses
  same-origin `/api/v1/*`.
- Opt-in OWNER device notifications for new website orders and due or overdue
  credit-sale follow-ups. Notification payloads contain no customer contact or
  financial data.

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

## Application routes

Public pages use `/`, `/shop`, `/products/:slug`, `/cart`, `/login`,
`/register`, and `/profile`. Shop filters are shareable query parameters:
`q`, `category`, `tag`, `featured`, `sort`, and `page`.

Owner pages are directly addressable under `/admin`: `/admin/dashboard`,
`/admin/products`, `/admin/categories`, `/admin/inventory`,
`/admin/physical-sales`, `/admin/dues`, and `/admin/orders`. The বাকি page is
linked from the dashboard and physical-sale screen on desktop and mobile.
Inventory stock additions, losses, reconciliations, and entry corrections use
route-backed drawers at `/admin/inventory/purchase`, `/admin/inventory/loss`,
`/admin/inventory/reconciliation`, and `/admin/inventory/correction`; direct
links, refresh, Back, and Forward preserve the intended workspace state. Stock
losses and reconciliations are dated with the current `Asia/Dhaka` date
automatically in V1.
Product creation, editing, and
pack/size management use `/admin/products/new`,
`/admin/products/:productId/edit`, and
`/admin/products/:productId/variants`. `/admin` redirects to the dashboard.

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
| `VAPID_PUBLIC_KEY` | backend/Vercel | Public half of the permanent Web Push signing pair |
| `VAPID_PRIVATE_KEY` | backend/Vercel | Secret Web Push signing key; never expose through `VITE_` |
| `VAPID_SUBJECT` | backend/Vercel | `mailto:` operations contact or an HTTPS origin |
| `CRON_SECRET` | backend/Vercel | Long random secret used by Vercel Cron authorization |

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

To discard all disposable showcase data, including legacy per-sale dues, and
recreate the complete demo dataset in a development or Preview database only:

```bash
CONFIRM_DEMO_RESET=RESET_NAFAH_AGRO_DEMO npm run seed:demo
```

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

Physical-shop sales default to immediate payment. Selecting `বাকি` requires a
unique customer name and next follow-up date; phone is optional. Type the name
to select an existing customer or explicitly create a new one. The form shows
the previous balance and projected balance before completing the sale. One
customer-level payment is allocated to the oldest outstanding sales, without
recording revenue or profit again. Customer details, payments, returns, and
contact-date changes remain available together in `/admin/dues`.
The shop-sale form can record an earlier sale date, but stock is deducted and
revenue is reported when that sale is entered. The earlier date remains visible
beside the recording timestamp. Record any money already received through the
customer's payment action after entering a forgotten বাকি sale.

An OWNER may additionally enable browser push per device from `/profile`. New
website orders notify only after the order commit succeeds. At 9 AM Dhaka, the
scheduled job sends one summary only when at least one credit follow-up is due
or overdue. An unchanged overdue date is reminded again the next morning;
moving the follow-up date stops reminders until that date. Browser permission
is never requested until the owner clicks `নোটিফিকেশন চালু করুন`.

Generate the VAPID pair once and keep the same values across deployments:

```bash
npx web-push generate-vapid-keys --json
openssl rand -base64 36
```

The first command provides `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`; the
second output can be used as `CRON_SECRET`. Set `VAPID_SUBJECT` to an operations
email such as `mailto:owner@example.com`. Chrome/Chromium is the primary target.
On iPhone/iPad, install the PWA to the Home Screen before enabling push. Every
browser profile or device must opt in separately. Explicit logout removes that
device subscription best-effort.

If the invitation email already belongs to a CUSTOMER, the profile screen offers
an explicit, reason-required promotion instead of creating another Supabase
identity. The same login, password, profile ID, active state, and customer-order
history remain. An unused promoted account can be changed back to CUSTOMER with
a reason; self-demotion, final-owner demotion, inactive targets, ordinary owners,
and accounts with owner-side activity are blocked. Promoted customer identities
are never removed through the unused-invitation delete action.

An invited OWNER must complete the dedicated password-setup screen before any
profile-management or admin workflow becomes available. The setup cannot be
skipped; after choosing a password the owner goes directly to the dashboard.

OWNER and CUSTOMER accounts can request a password-change email from `/login`.
Supabase must allow these exact recovery redirects:

- `https://nafah-agro.vercel.app/reset-password`
- `http://localhost:8080/reset-password`

After a valid recovery link sets a new password, the temporary session is
signed out and the user logs in normally. Configure production SMTP before
depending on recovery email delivery. No additional environment variable or
backend service-role access is required for this self-service flow.

An OWNER may also permanently delete an empty category or a product that has
never appeared in inventory, a stock adjustment, an order, or a selling-price
update. Product setup
variants and price-history rows are removed in the same transaction. Cloudinary
files are retained for manual orphan review. Apply all checked-in migrations
before using this workflow.

Packaged products use whole-piece stock and may have multiple pack/size
options. A new packaged pack/size requires a short `বিক্রির ইউনিট` label. It can
be corrected only before stock or business history exists. Completed sale items
keep a unit-label snapshot, so later setup changes cannot rewrite old orders.
A loose product has one hidden internal option, a selling/buying rate
per kg or litre, and independent FIFO stock. Loose products never appear in the
public storefront or delivery-order forms.

Check cached stock totals against authoritative batches with:

```bash
npm run inventory:check
```

## Installable web app

The production site is an installable Progressive Web App in supported Chrome
and Chromium browsers. When Chrome reports that installation is available, the
homepage and mobile menu show `অ্যাপ ইনস্টল করুন`; Chrome then owns the native
confirmation dialog. The action stays hidden when the app is already installed,
running in standalone mode, or the browser has not made installation available.

The service worker precaches only the application shell, versioned frontend
assets, fonts, and icons. `/api/*`, Supabase, Cloudinary, prices, stock, orders,
authentication, and business mutations are never cached for offline use. The
installed shell can open without a connection, but it displays an offline notice
and requires internet before live data or business work can continue.

Chrome may require HTTPS, a supported device, user interaction, and sufficient
engagement before exposing its install prompt. Test the production build in
DevTools under Application > Manifest and Application > Service Workers. A new
service-worker version shows an explicit update action instead of reloading an
unfinished sale or order automatically.

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
