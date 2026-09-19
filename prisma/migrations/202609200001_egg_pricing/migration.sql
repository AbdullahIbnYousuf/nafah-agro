ALTER TYPE "ProductKind" ADD VALUE IF NOT EXISTS 'EGG';

CREATE TYPE "SellingPriceTier" AS ENUM ('REGULAR', 'EGG_BULK');

ALTER TABLE "product_variants"
  ADD COLUMN "bulk_selling_price" DECIMAL(14,2);

ALTER TABLE "selling_price_history"
  ADD COLUMN "price_tier" "SellingPriceTier" NOT NULL DEFAULT 'REGULAR';

ALTER TABLE "sales_order_items"
  ADD COLUMN "selling_price_tier" "SellingPriceTier" NOT NULL DEFAULT 'REGULAR';

ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_bulk_selling_price_positive"
  CHECK (
    "bulk_selling_price" IS NULL
    OR ("bulk_selling_price" > 0 AND "bulk_selling_price" < "current_selling_price")
  );
