-- All access goes through Express and the verified PostgreSQL profile.
-- No direct anon/authenticated PostgREST access to draft cart data is allowed.
ALTER TABLE "account_carts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cart_merge_receipts" ENABLE ROW LEVEL SECURITY;
