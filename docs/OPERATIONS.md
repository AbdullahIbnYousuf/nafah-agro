# Nafah Agro V1 operations

## Account ownership

Before production, record the responsible person, recovery email, billing
owner, and MFA status for GitHub, Vercel, Supabase, Cloudinary, and the domain.
Keep that register in the client's password manager—not in this repository.
Production release is blocked until every row has a named primary and backup
owner.

## Backups and migrations

- Confirm the Supabase plan's backup/PITR policy and test restoring into a
  separate project before launch. Do not assume a plan includes a particular
  retention period.
- Before a material migration, take a protected logical backup with a direct
  connection, for example `pg_dump "$DIRECT_URL" --format=custom --file=nafah-pre-migration.dump`.
- Apply only checked-in migrations with
  `npx prisma migrate deploy --schema prisma/schema.prisma`.
- Run `npm run inventory:check` after migrations and before/after stock-heavy
  demonstrations. Never repair a discrepancy by directly overwriting cached
  variant totals.

## Owner access and recovery

Normal additional-owner flow: an active OWNER uses `/profile`; invitations
require the backend service-role key, Supabase SMTP, and correct redirects.
Bootstrap/recovery flow: an authorized operator creates or recovers the Auth
identity and runs the controlled `npm run owner:create -- ... --confirm`
command. The database prevents deactivating, demoting, or deleting the final
active owner. Maintain at least two active owners with MFA and separate recovery
channels.

## Health, logs, and rate limiting

- `curl -i https://HOST/api/v1/health` must return JSON 200 with PostgreSQL
  `ready`. A 503 means database connectivity failed.
- Preserve the `X-Request-ID` from failed API responses and search Vercel logs by
  time, route, status, and request ID. Production responses intentionally hide
  stacks and database details.
- Rate limits are process-memory counters. Vercel instances do not share them,
  and cold starts reset them. This is acceptable as a V1 abuse brake, not a
  global quota. The smallest production mitigation is a Vercel Firewall/WAF
  rate-limit rule for owner-invitation, upload, authentication-sensitive, and
  checkout routes. Use a shared Redis limiter only if measured abuse requires it.

## Rollback and record investigation

- Frontend/API rollback: in Vercel, select the last known-good deployment and
  promote/redeploy it. Re-run routing, health, auth, and one read-only stock check.
- Database migrations do not roll back with Vercel. Prefer a forward corrective
  migration; use a tested backup restore only under an incident plan.
- For an incorrect order or stock record, stop related mutations, note the order
  number/SKU/request ID/time/actor, run `npm run inventory:check`, and inspect
  append-only audits, allocations, and batches. Do not edit history or delete an
  order. Use the reason-required stock-adjustment workflow for a legitimate
  physical count correction; escalate integrity corruption to a developer after
  a backup.
- Product records currently store Cloudinary secure URLs, not public IDs.
  Deactivation and the unused-product cleanup do not delete remote images.
  Review orphaned uploads in Cloudinary manually until a future controlled
  cleanup workflow is approved. Never hard-delete a product with stock,
  adjustment, order, or selling-price update history; deactivate it instead.
