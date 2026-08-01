# Nafah Agro Project Status

Last updated: 2026-08-01

## Summary

Milestones 1 and 2 are complete in code. Deployment and real
Supabase/PostgreSQL/Cloudinary integration remain unverified because external
credentials were not used. Milestone 3 has not started.

## Completed

- Planning documents exist and define the practical V1.
- npm/Node foundation, Vercel-compatible Express entry, security headers, CORS,
  request limits, safe errors, rate limiting, environment validation, Prisma,
  Supabase token verification, profiles, and owner creation are present.
- Roles are only `OWNER`, `ADMIN`, and `CUSTOMER`, with active/inactive profiles.
- Browser login, logout, registration, session restoration, and protected routes
  use Supabase Auth.
- Public admin setup, unlock-code workflow, moderators, custom JWT creation and
  verification, and MongoDB user authentication have been removed.
- Customer sign-up can create only a `CUSTOMER` profile via a database trigger;
  owner creation remains a controlled CLI workflow.
- PostgreSQL models/migration exist for categories, products, product variants,
  variant stock totals, and immutable selling-price history.
- Catalog APIs use Zod, Prisma transactions, Supabase profile authorization, and
  public storefront reads.
- Admin catalog UI supports variant creation/editing/activation, global unique
  SKUs, default variants, price-history inspection, and atomic single/bulk price
  changes.
- Every product is transactionally created with one active default variant,
  including products without customer-visible options.
- Duplicate slugs/SKUs return safe conflicts; public reads hide inactive
  categories, products, and variants.
- Registration requires phone metadata. Missing trigger-created CUSTOMER
  profiles can be safely recovered for the verified token subject; trigger
  failures return a clear retry message and cannot create privileged profiles.
- The existing storefront now calls the PostgreSQL `/api/v1` catalog.
- Old MongoDB product/category routes and models are removed.
- Guest checkout remains available through the temporary MongoDB order endpoint.

## Verification on 2026-08-01

- `npm run typecheck`: passed.
- `npm run lint`: passed with no errors or warnings.
- `npm test -- --run`: 42 tests passed across five files.
- `npm run build`: passed; Vite reported a non-blocking 706.40 kB JavaScript
  chunk and stale Browserslist-data warnings.
- `npm run build:server`: passed.
- `npm run prisma:validate`: passed.
- `npm run prisma:generate`: passed when run sequentially (do not run two Prisma
  generators concurrently against the same output directory).
- Prisma migration was generated/validated locally but not applied to Supabase.
- Cloudinary and Vercel deployment were not tested.

## Temporary legacy surface

- `MONGO_URI`, Mongoose, and MongoDB models remain for guest/order management.
- `/api/orders` is temporary; guest creation is public and management uses
  Supabase OWNER/ADMIN authorization.
- Cloudinary upload is still an unversioned route, now Supabase-protected.

Custom JWT/password dependencies, the Mongo `User` model, moderator pages, and
legacy auth routes are removed.

## Milestone 2 external acceptance remaining

- Apply the new migration to a real Supabase project and test the signup trigger.
- Exercise category/product/variant/single and bulk price updates with real OWNER
  and ADMIN accounts; verify CUSTOMER denial with a real token.
- Test email-confirmation-on and email-confirmation-off registration, including
  phone metadata and the resulting active CUSTOMER profile.
- Verify image upload and product images with real Cloudinary credentials.
- Run browser-level storefront checks against seeded PostgreSQL data.

## Why `MONGO_URI` cannot be removed yet

Guest checkout, customer order history, admin order management, the Mongoose
`Order` model, and local Mongo connection middleware still depend on MongoDB.
It can be removed only after the PostgreSQL guest/manual order vertical replaces
every `/api/orders` consumer.
