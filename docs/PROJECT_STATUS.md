# Nafah Agro V1 Project Status

## Current status

```text
Date: July 30, 2026
Stage: Milestone 1 foundation
Overall status: READY_FOR_EXTERNAL_VERIFICATION — credentials and deployment pending
```

All four planning documents exist. Milestones 2–5 (products, FIFO inventory,
orders, and analytics) remain untouched.

## Milestone 1 completed locally

- Created local annotated baseline tag `pre-nafah-agro-v1-rebuild` at commit
  `8a7e9ae`; the tag was new and was not pushed.
- Standardized on npm, retained only `package-lock.json`, removed both unused
  Bun lockfiles, and recorded Node `22.22.3` in `.nvmrc`.
- Fixed the baseline 16 lint errors and 11 warnings without changing business
  behavior.
- Replaced active English/Bangla legacy branding, metadata, cart storage key,
  coupon name, map query, documentation examples, MongoDB example name, and
  Cloudinary folder with Nafah Agro equivalents. A repository-wide legacy-name
  search is clean.
- Added strict Zod environment parsing for frontend and backend configuration.
  Removed custom-JWT and admin-code fallback secrets.
- Added Helmet, an exact-origin CORS allowlist, configurable JSON size limit,
  request IDs, structured logging, and safe production errors.
- Added a minimal Prisma 7 PostgreSQL schema, SQL migration with RLS enabled,
  migration seed, and Supabase-compatible pooled/direct connection workflow.
- Added Supabase JWKS access-token verification middleware.
- Added token-to-profile resolution, active/inactive enforcement,
  `requireAuthenticated`, `requireOwner`, and `requireAdminOrOwner`.
- Added a one-time initial-owner command with duplicate-owner/profile guards and
  no public owner-registration endpoint.
- Added per-IP rate limits to legacy authentication routes and all protected
  foundation proof routes.
- Added `GET /api/v1/health` plus authenticated, admin-or-owner, and owner-only
  foundation proof routes.
- Added a root default-exported Express `server.ts` for Vercel compatibility.
- Added meaningful environment, health, security-header, token rejection, and
  protected-read tests.
- Updated `.env.example`, `README.md`, `API.md`, and this status.

Existing MongoDB/Mongoose feature routes remain in place until their individual
PostgreSQL replacements are built. The new `/api/v1` foundation does not use
the legacy custom JWT.

## Verification

### Baseline before changes

| Check | Result |
|---|---|
| Frontend TypeScript | PASS |
| Backend TypeScript | PASS |
| Lint | FAIL — 16 errors, 11 warnings |
| Tests | PASS — one placeholder only |
| Frontend production build | PASS |
| Backend production build | PASS |

### Current local result

| Check | Result |
|---|---|
| `npm run typecheck:frontend` | PASS |
| `npm run typecheck:backend` | PASS |
| `npm run lint` | PASS — 0 errors, 0 warnings |
| `npm test` | PASS — 19 tests in 3 files |
| `npm run build` | PASS; existing 500 kB chunk and stale Browserslist-data warnings |
| `npm run build:server` | PASS |
| `npm run prisma:generate` | PASS |
| `npm run prisma:validate` | PASS |
| `npm audit --omit=dev` | FAIL — 6 advisories remain (4 high, 2 moderate) after compatible fixes |
| `npm audit` | FAIL — 17 total advisories remain (14 high, 3 moderate); available complete fixes require breaking upgrades |

Supertest needs permission to open an ephemeral localhost listener. Its first
sandboxed run failed with `listen EPERM`; the identical test command passed
outside that restriction. This is an execution-environment limitation, not an
endpoint failure.

## Proof endpoint

`GET /api/v1/foundation`:

1. passes through the shared Express security and rate-limit middleware;
2. requires `Authorization: Bearer <Supabase access token>`;
3. verifies Supabase JWKS signature, issuer, audience, expiry, and subject;
4. resolves the token subject to an active PostgreSQL profile;
5. queries `foundation_records.key = "milestone-1"` through Prisma; and
6. returns the authenticated user/profile and seeded record.

`/api/v1/foundation/admin` additionally requires `ADMIN` or `OWNER`, while
`/api/v1/foundation/owner` requires `OWNER`. Tests cover missing and inactive
profiles, customer denial, admin access, owner-only access, and rate limiting.
No claim is made that live Supabase or Vercel connectivity works yet.

## External verification and decisions still required

- The current local `.env` fails the new minimum lengths for `JWT_SECRET` and
  `ADMIN_UNLOCK_CODE`. Replace them locally with new random values; do not send
  them in chat or commit them.
- Provide/own a Supabase development project and configure backend
  `DATABASE_URL`, `DIRECT_URL`, and `SUPABASE_URL`, plus frontend-public
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Apply the migration and seed to Supabase, create a test user, then verify a
  real access token against the deployed endpoint.
- Configure separate Vercel frontend/API projects and their environment
  variables. The entry shape is ready, but deployment is not verified.
- Provide Cloudinary credentials to verify upload/delete behavior. Cloudinary
  is not required for the foundation endpoint.
- Confirm the initial owner identity, create the Supabase Auth user, and run the
  controlled `npm run owner:create -- ... --confirm` command.
- The remaining audit advisories are accepted development-stage risks. The
  production-tree paths involve React Router and the
  `tailwindcss-animate → tailwindcss → sucrase/glob/minimatch/brace-expansion`
  build chain. Full development results also include Vite/esbuild and
  ESLint/minimatch. Do not force breaking upgrades merely to clear the audit.

Production builds pass locally, but Supabase PostgreSQL/Auth, Cloudinary, and
both Vercel deployments remain `NOT_VERIFIED`.

## Next work

Complete the external Milestone 1 proof:

1. rotate the weak local legacy secrets;
2. provision Supabase, migrate/seed, and exercise a real token;
3. create the initial owner with the controlled CLI;
4. deploy the API and frontend proof projects on Vercel;
5. verify Cloudinary; and
6. rerun checks and record real-token responses and deployment URLs.

Do not start product, inventory, order, or analytics implementation until the
external proof passes.

## Git delivery

The original annotated tag must remain at `8a7e9ae`. The focused Milestone 1
commit and `pre-nafah-agro-v1-rebuild` tag must be pushed manually when GitHub
credentials are unavailable:

```bash
git push origin main
git push origin pre-nafah-agro-v1-rebuild
```
