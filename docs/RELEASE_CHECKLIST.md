# Nafah Agro V1 demo and release checklist

Use disposable staging data for destructive return/cancellation tests. Record
the tester, date, deployment URL, commit, and evidence for every checked item.

## Client demonstration flow

1. Sign in as OWNER, refresh `/admin`, and confirm the session restores.
2. From `/profile`, invite a second OWNER; accept the email, set a password,
   sign in, and verify OWNER access. Confirm CUSTOMER access to `/admin` is denied.
3. Register a CUSTOMER with required phone metadata, sign out/in, update the
   profile, and open customer order history.
4. As a guest, browse `/`, filter `/shop`, open a product/variant, adjust the
   cart, and submit COD checkout. Repeat the same request key to demonstrate one
   order only.
5. Create/edit/activate/deactivate a category, product, and variants; upload an
   image; demonstrate duplicate slug/SKU rejection, a single price update, a
   bulk price update, and immutable price history.
   Separately delete one empty category and one never-used product. Confirm the
   delete action disappears after stock, an order, or a real price update exists.
6. Enter two purchases for one variant at different costs/dates. Show batch and
   variant totals, then make a reason-required increase and decrease adjustment.
7. Complete a physical CASH sale that spans both FIFO batches. Show captured
   price/cost, gross profit, and the explicit loss-warning dialog with a safe test.
8. Create website, phone, Facebook, and WhatsApp delivery orders. Confirm a
   pending order to reserve FIFO stock; process and deliver it; show PAID status
   and recognized revenue/profit.
9. Cancel one pending/confirmed order and mark another failed delivery with
   explicit reasons. Confirm reserved stock is released and analytics exclude both.
10. Return one complete order as SELLABLE and another as DAMAGED. Confirm the
    dialog lists items, requires a reason, explains stock impact, and closing it
    performs no action. Verify only SELLABLE restores stock and both reverse
    revenue/profit.
11. Show customer history and OWNER analytics for today, week, month, and a
    custom range; reconcile sources, rankings, low/out-of-stock counts, stock
    totals, inventory value, discounts, returns, and delivery-charge separation.
12. Repeat public and management critical paths at 390 px, tablet, and desktop;
    verify keyboard focus, dialogs, horizontal table scrolling, touch targets,
    empty/loading/error states, and no console errors.

## Production gate

- [ ] Named primary/backup owners and MFA recorded for all external accounts.
- [ ] Client-approved Dhaka and Outside-Dhaka charges entered.
- [ ] Customer registration launch decision confirmed.
- [ ] Opening stock and buying costs approved and entered.
- [ ] Supabase backup/restore drill completed; pre-migration backup stored safely.
- [ ] All migrations and the safe seed applied; `npm run inventory:check` passes.
- [ ] Full automated command suite and `git diff --check` pass on release commit.
- [ ] Vercel Preview routing, function detection, health, JSON API 404, and SPA
      refresh checks pass.
- [ ] Supabase Site URL, local/production/Preview redirects, SMTP, invitation,
      login, refresh, and profile trigger pass with real identities.
- [ ] Cloudinary authorization/MIME/size/count checks and real image rendering pass.
- [ ] Guest idempotency and concurrent final-stock tests pass against PostgreSQL.
- [ ] Analytics values match the deterministic acceptance dataset.
- [ ] Client content is approved, including contact email, product text/images,
      and legal/privacy/return wording. `info@nafahagro.com` is not verified by code.
- [ ] Previous Vercel deployment rollback and incident contacts are known.
- [ ] Production smoke check repeats `/`, `/shop`, `/admin`, a real product,
      health, unknown API, auth, one read-only catalog call, and logs.
