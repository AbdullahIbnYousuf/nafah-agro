# Nafah Agro Deployment Guide

Deployment is intentionally deferred for review. The target is one Vercel
project: React/Vite serves `/`, the existing Express application serves
`/api/v1/*`, Supabase provides PostgreSQL/Auth, and Cloudinary stores images.

## Repository and routing

```text
api/index.ts      thin Vercel Function entry; imports the shared Express app
server.ts          creates the single Express app instance
server/            Express routes, middleware, services, and environment checks
src/               React/Vite frontend
dist/              generated frontend production output
vercel.json        Vite build output and non-API SPA fallback
```

Vercel discovers `api/index.ts` as the API Function. `vercel.json` forwards
`/api/(.*)` to it without adding a named query parameter or duplicating Express setup. Existing static files take
precedence, non-API paths such as `/`, `/shop`, `/admin`, and `/products/:slug`
fall back to `index.html`, and `/api` is excluded from that fallback. Express
returns JSON for API 404s.

## Before deployment

```bash
npm ci
npm run typecheck
npm run lint
npm test -- --run
npm run build
npm run build:server
npm run prisma:validate
npx prisma migrate deploy --schema prisma/schema.prisma
git diff --check
```

Create the first Supabase Auth user and run the controlled owner command shown
in `README.md`. Test `/api/v1/health`, `/api/v1/auth/me`, and protected routes
with real OWNER, ADMIN, and CUSTOMER access tokens.

## Exact Vercel dashboard settings

Import this repository as one project, then use:

| Setting | Value |
| --- | --- |
| Framework Preset | `Vite` |
| Root Directory | repository root (`.`; leave the field empty) |
| Install Command | `npm ci` |
| Build Command | `npm run build` (also fixed in `vercel.json`) |
| Output Directory | `dist` (also fixed in `vercel.json`) |
| Node.js Version | `22.x` |
| Development Command | no override |

Add these encrypted variables to Production. Use separate Supabase/Cloudinary
resources for Preview where practical, then add the corresponding Preview
values:

| Variable | Value/scope |
| --- | --- |
| `DATABASE_URL` | Supabase pooled runtime URL; server only |
| `SUPABASE_URL` | Supabase project URL; server only |
| `SUPABASE_JWT_AUDIENCE` | `authenticated` |
| `VITE_SUPABASE_URL` | same project URL; intentionally public |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/publishable key; intentionally public |
| `CLOUDINARY_CLOUD_NAME` | required for image upload |
| `CLOUDINARY_API_KEY` | required for image upload; server only |
| `CLOUDINARY_API_SECRET` | required for image upload; server only |
| `NODE_ENV` | `production` |
| `JSON_BODY_LIMIT` | `100kb` |

`DIRECT_URL` is required only where `prisma migrate deploy`, the seed, or owner
creation is run. Keep it in a protected local/CI migration environment; the
deployed API Function does not need it. Do not configure `VITE_API_URL`,
`FRONTEND_URL`, `CLIENT_URL`, a Supabase service-role key, or a separate backend
domain.

Never place PostgreSQL credentials, the Cloudinary secret, or a direct database
URL in a `VITE_` variable.

## Local development

Run `npm run server` and `npm run dev` in separate terminals. Vite listens on
port `8080` and proxies `/api` to `http://localhost:4000`, preserving the same
browser URLs used in production. The API allows only the checked-in localhost,
127.0.0.1, and IPv6 localhost Vite origins outside production. If the proxy is
intentionally bypassed, set `VITE_API_URL=http://localhost:4000/api` locally.

## First-deployment sequence

1. Apply migrations and seed from a protected workstation or CI environment
   using `DATABASE_URL` and `DIRECT_URL`; do not run `prisma db push`.
2. Configure the dashboard settings and variables above.
3. Push the reviewed commit or create a Preview deployment. This repository has
   not been deployed by Codex.
4. In Vercel's deployment Resources view, confirm one Function generated from
   `api/index.ts` and the Vite assets under `dist`.
5. Smoke-test `/`, `/admin`, `/shop`, `/products/<real-slug>`,
   `/api/v1/health`, and an unknown `/api/v1/...` path. The unknown API path
   must return JSON 404, while frontend deep links must return the SPA.
6. Test Supabase login, one authorized API request, and a Cloudinary upload.

See `README.md` and `API.md` for route/setup details. No production deployment
has yet been verified.
