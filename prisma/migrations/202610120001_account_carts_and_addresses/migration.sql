ALTER TABLE "profiles" ADD COLUMN "delivery_address" TEXT,
  ADD COLUMN "preferred_delivery_rate_id" UUID;

CREATE TABLE "account_carts" (
  "profile_id" UUID PRIMARY KEY REFERENCES "profiles"("id") ON DELETE CASCADE,
  "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
  "items" JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof("items") = 'array'),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "cart_merge_receipts" (
  "profile_id" UUID NOT NULL REFERENCES "account_carts"("profile_id") ON DELETE CASCADE,
  "merge_key" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("profile_id", "merge_key")
);
