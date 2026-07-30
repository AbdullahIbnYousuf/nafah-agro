# Nafah Agro

Nafah Agro is a Bangla React/Vite storefront with an Express API. Milestone 1
adds a secure PostgreSQL/Supabase Auth foundation while retaining the existing
MongoDB/Mongoose routes until each feature is replaced. Products, inventory,
orders, and analytics have not yet been migrated to PostgreSQL.

## Stack

- React 18, Vite, TypeScript, React Router, Tailwind CSS, and shadcn/ui
- Express and TypeScript
- PostgreSQL through Prisma 7 (`@prisma/adapter-pg`)
- Supabase PostgreSQL and Supabase Auth
- Existing MongoDB/Mongoose feature routes during the transition
- Cloudinary for product images
- Vitest and Supertest
- Vercel for separate frontend and backend projects

## Requirements

- Node.js 22.12 or newer in the Node 22 line (`.nvmrc` records 22.22.3)
- npm 10 or newer; npm and `package-lock.json` are the only package manager
  and lockfile used by this repository
- MongoDB for the existing feature routes
- A Supabase project for the Milestone 1 PostgreSQL/Auth proof
- Cloudinary credentials only when testing image uploads

## Install

```bash
nvm use
npm install
cp .env.example .env
```

Replace every placeholder needed by the service you are running. Never commit
`.env` or real credentials.

## Run locally

Use two terminals:

```bash
# Terminal 1: Express + the existing MongoDB routes
npm run server

# Terminal 2: Vite
npm run dev
```

The frontend runs at `http://localhost:8080`, proxies `/api` to
`http://localhost:4000`, and the API health endpoint is
`http://localhost:4000/api/v1/health`.

The backend validates its environment before startup. The existing local server
still connects to MongoDB because its product/order replacements are outside
Milestone 1. PostgreSQL and Supabase variables are optional as a group; the
foundation endpoint returns `503` until they are configured.

## Environment

Backend-only variables:

| Variable | Required | Purpose |
|---|---:|---|
| `NODE_ENV` | No | `development`, `test`, or `production` |
| `PORT` | No | Local Express port; default `4000` |
| `MONGO_URI` | Yes, legacy | Existing Mongoose feature routes; remove after route replacement |
| `FRONTEND_URL` | Yes | Exact allowed CORS origin |
| `JSON_BODY_LIMIT` | No | Express JSON limit; default `100kb` |
| `RATE_LIMIT_WINDOW_MS` | No | Rate-limit window; default 15 minutes |
| `AUTH_RATE_LIMIT_MAX` | No | Authentication-route requests per IP/window; default 20 |
| `PROTECTED_RATE_LIMIT_MAX` | No | Foundation-route requests per IP/window; default 60 |
| `JWT_SECRET` | Yes, legacy | Temporary custom-JWT secret, minimum 32 characters |
| `ADMIN_UNLOCK_CODE` | Yes, legacy | Temporary public legacy admin-setup code, minimum 12 characters |
| `CLOUDINARY_CLOUD_NAME` | Together | Existing image uploads |
| `CLOUDINARY_API_KEY` | Together | Existing image uploads |
| `CLOUDINARY_API_SECRET` | Together | Existing image uploads |
| `DATABASE_URL` | With `SUPABASE_URL` | Supabase pooled PostgreSQL runtime URL |
| `DIRECT_URL` | For migrations | Supabase direct/session PostgreSQL URL |
| `SUPABASE_URL` | With `DATABASE_URL` | JWT issuer/JWKS location |
| `SUPABASE_JWT_AUDIENCE` | No | Default `authenticated` |

Frontend-public variables:

| Variable | Required | Purpose |
|---|---:|---|
| `VITE_API_URL` | No | API base; default `/api` |
| `VITE_SUPABASE_URL` | Together | Public Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Together | Public publishable/anon key |

Only `VITE_*` values are bundled into the frontend. Never add a database
password, Supabase service-role key, Cloudinary secret, or legacy JWT secret to
a `VITE_*` variable.

`MONGO_URI`, `JWT_SECRET`, and `ADMIN_UNLOCK_CODE` remain mandatory only because
the old routes still depend on them. They are scheduled for removal when all
legacy MongoDB/custom-JWT routes have PostgreSQL/Supabase replacements.

## Supabase values required

Copy these values from the Supabase project dashboard:

- `DATABASE_URL`: pooled transaction connection string for the backend runtime.
- `DIRECT_URL`: direct/session connection string used by migrations, seed, and
  the owner-creation command.
- `SUPABASE_URL`: Project URL, such as `https://PROJECT_REF.supabase.co`.
- `VITE_SUPABASE_URL`: the same public Project URL.
- `VITE_SUPABASE_ANON_KEY`: the public publishable/anon key.
- `SUPABASE_JWT_AUDIENCE=authenticated`: keep this literal unless the project
  intentionally uses a different JWT audience.

You also need the database password embedded in the two PostgreSQL URLs. A
service-role key is not needed by the current foundation or owner workflow.

## Apply the foundation and create the owner

After creating the Supabase project and filling `.env`:

```bash
npm install
npm run prisma:generate
npm run prisma:validate
npx prisma migrate deploy
npx prisma db seed
```

Use `DIRECT_URL` for migration/seed administration and the Supabase pooled
`DATABASE_URL` for the serverless runtime. The first migration creates only
`profiles` and `foundation_records`; it intentionally does not implement
products, inventory, orders, or analytics.

Next, use Supabase Dashboard → Authentication → Users → Add user. Create and
confirm the initial owner's login, copy its UUID, and run:

```bash
npm run owner:create -- \
  --user-id "SUPABASE_AUTH_USER_UUID" \
  --full-name "Owner Name" \
  --phone "+8801XXXXXXXXX" \
  --confirm
```

The command refuses to run without `--confirm`, refuses to replace an existing
profile, and refuses to create a second owner. The database foreign key also
requires the UUID to exist in `auth.users`. There is no owner-registration API.

## Verify with a real token

Start the API, then check database health:

```bash
curl --fail-with-body http://localhost:4000/api/v1/health
```

Obtain an access token through the application or Supabase password grant:

```bash
curl --fail-with-body \
  --request POST \
  --url "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  --header "apikey: $VITE_SUPABASE_ANON_KEY" \
  --header "Content-Type: application/json" \
  --data '{"email":"OWNER_EMAIL","password":"OWNER_PASSWORD"}'
```

Copy the returned `access_token` into a temporary shell variable, then test the
authenticated, admin-or-owner, and owner-only proof routes:

```bash
export SUPABASE_ACCESS_TOKEN="paste-access-token-here"

curl \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  http://localhost:4000/api/v1/foundation

curl \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  http://localhost:4000/api/v1/foundation/admin

curl \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  http://localhost:4000/api/v1/foundation/owner
```

## Quality checks and builds

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run build:server
```

Frontend output is `dist/`; backend TypeScript output is `dist-server/`.

## Vercel deployment

The root `server.ts` default-exports the Express app, which is compatible with
Vercel's Express entry convention, so this source layout does not require a
`vercel.json`.

Create two Vercel projects from the same repository:

1. Frontend: select the Vite preset, use `npm run build`, output `dist`, and set
   `VITE_API_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`.
2. Backend: select the Express preset/entry, keep root `server.ts`, and set
   `NODE_ENV=production`, `FRONTEND_URL`, `DATABASE_URL`, `SUPABASE_URL`,
   `SUPABASE_JWT_AUDIENCE`, rate-limit values, plus the temporary legacy
   `MONGO_URI`, `JWT_SECRET`, and `ADMIN_UNLOCK_CODE`.
3. Deploy the backend first, set frontend `VITE_API_URL` to its `/api` URL,
   deploy the frontend, then update backend `FRONTEND_URL` to the final frontend
   origin and redeploy.

The built-in rate-limit store is per serverless instance. It is basic abuse
protection for this proof; use a shared durable store before higher traffic or
security-sensitive production use.

## Git delivery

The baseline tag and Milestone 1 commit are local until pushed. If GitHub
credentials are not available in this environment, run these manually from an
authenticated terminal:

```bash
git push origin main
git push origin pre-nafah-agro-v1-rebuild
```

Do not recreate or move the existing baseline tag.

## Accepted development-stage dependency risks

No breaking audit upgrade is applied in Milestone 1. The production-tree audit
currently identifies:

- `react-router-dom` / `react-router`: browser runtime advisories requiring a
  major migration to clear completely.
- `tailwindcss-animate`'s Tailwind build chain:
  `tailwindcss → sucrase → glob/minimatch/brace-expansion`. This is build-time
  tooling and is not shipped as executable application code in the browser
  bundle.

The full development audit also includes Vite/esbuild and ESLint/minimatch.
These are accepted temporarily and must be reassessed before production launch.

## Repository structure

```text
src/                 React application and public environment validation
server/
  app.ts             Express composition, security, health, and API routes
  index.ts           Local long-running server plus legacy MongoDB connection
  env.ts             Strict backend environment validation
  lib/               Prisma and Supabase Auth clients
  middleware/        Legacy JWT and new Supabase middleware
  models/, routes/   Existing MongoDB feature implementation
  services/          PostgreSQL foundation queries
prisma/              Prisma schema, seed, and SQL migrations
docs/                Agreed V1 scope, system design, plan, and status
server.ts            Vercel-compatible Express default export
API.md               Foundation and legacy endpoint reference
```

The authoritative implementation boundaries and current verification status are
in `docs/IMPLEMENTATION_PLAN.md` and `docs/PROJECT_STATUS.md`.
