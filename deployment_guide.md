# Nafah Agro Deployment Guide

Deployment is intentionally deferred until local catalog verification succeeds.
The V1 target is:

- React/Vite frontend on Vercel.
- Express backend on Vercel.
- PostgreSQL and Auth on Supabase.
- Product images on Cloudinary.
- MongoDB temporarily, only while `/api/orders` remains legacy.

## Before deployment

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run build:server
npm run prisma:validate
npx prisma migrate deploy
```

Create the first Supabase Auth user and run the controlled owner command shown
in `README.md`. Test `/api/v1/health`, `/api/v1/auth/me`, and the catalog routes
with real OWNER, ADMIN, and CUSTOMER access tokens.

## Required Vercel values

Frontend: `VITE_API_URL`, `VITE_SUPABASE_URL`, and the public
`VITE_SUPABASE_ANON_KEY`.

Backend: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_JWT_AUDIENCE`,
`FRONTEND_URL`, `MONGO_URI` (temporary), and Cloudinary values when uploads are
enabled. Keep `DIRECT_URL` in the migration environment rather than exposing it
to the frontend.

Never place the Supabase service-role key, PostgreSQL credentials, Cloudinary
secret, or direct database URL in a `VITE_` variable.

See `README.md` and `API.md` for exact setup and smoke-test details. No production
deployment has yet been verified.
