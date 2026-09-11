ALTER TABLE "categories"
ADD COLUMN "is_visible_in_shop" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "products"
ADD COLUMN "is_visible_in_shop" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "products_category_id_is_active_is_visible_in_shop_idx"
ON "products"("category_id", "is_active", "is_visible_in_shop");
