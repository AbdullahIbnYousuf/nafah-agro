# Nafah Agro single-project deployment

Deployment is intentionally not performed by this Milestone 6 review. The
target is one Vercel project: Vite serves frontend routes, `api/index.ts`
default-exports the shared Express app, and `/api/v1/*` reaches that function.
The function never calls `app.listen()`.

## Vercel dashboard settings

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Root directory | repository root (`.` / blank) |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node.js | 22.x |

Set these encrypted Production values: `DATABASE_URL`, `SUPABASE_URL`,
`SUPABASE_JWT_AUDIENCE=authenticated`, `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET`, and optionally `JSON_BODY_LIMIT=100kb`. Add
`SUPABASE_SERVICE_ROLE_KEY` only when email invitations for additional owners
are enabled. Never place database, Cloudinary-secret, or service-role values in
a variable whose name begins with `VITE_`.

Keep `DIRECT_URL` in a protected migration workstation or CI environment. The
deployed API does not use it.

## Supabase Auth URL settings

Configure before browser acceptance:

- Site URL: the canonical production URL, for example
  `https://nafah-agro.vercel.app`.
- Redirect allow list: `http://localhost:8080/**`, the canonical production
  URL with `/**`, and each Preview deployment hostname used for acceptance.
- Production SMTP: required before relying on owner invitation emails.

Prefer exact Preview hostnames. If the team chooses a Supabase wildcard, scope
it to this Vercel project/account and review it periodically.

## Migration and Preview sequence

1. Create a disposable/staging Supabase project and Cloudinary folder/account.
2. Export `DATABASE_URL` and protected `DIRECT_URL`; run:

   ```bash
   npm ci
   npm run typecheck
   npm run lint
   npm test -- --run
   npm run build
   npm run build:server
   npm run prisma:validate
   npx prisma migrate deploy --schema prisma/schema.prisma
   npm run seed
   npm run inventory:check
   ```

3. Create a Supabase Auth user and run the controlled OWNER command from README.
4. Set approved delivery charges in the OWNER order screen.
5. Create a Vercel Preview with staging-only variables. Confirm `api/index.ts`
   appears as a Node.js Function in the deployment Resources/Functions view.
6. Run the staging checks below. Do not promote until every destructive-flow
   check is performed on disposable data and signed off.

## Exact routing and staging checks

Use `BASE=https://preview-host` in a shell:

```bash
curl -i "$BASE/api/v1/health"
curl -i "$BASE/api/v1/not-a-route"
curl -I "$BASE/"
curl -I "$BASE/shop"
curl -I "$BASE/admin"
curl -I "$BASE/products/REAL_ACTIVE_SLUG"
curl -I "$BASE/a-frontend-route-that-does-not-exist"
```

Expected results:

- health is JSON 200 with API and PostgreSQL `ready`;
- the unknown API route is JSON 404 with `API_NOT_FOUND`;
- `/`, `/shop`, `/admin`, and a real product deep link serve the SPA on direct
  request and refresh;
- an unknown frontend route serves the SPA, whose React 404 page is visible;
- browser Network entries call the same host under `/api/v1`, not another domain.

Then verify real Supabase login/session restoration after refresh, OWNER and
CUSTOMER denials, PostgreSQL writes, an allowed Cloudinary image upload and
render, and every flow in [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).
