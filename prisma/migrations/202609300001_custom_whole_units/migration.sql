ALTER TABLE "product_variants"
  ADD COLUMN "unit_label" TEXT NOT NULL DEFAULT 'ইউনিট';

UPDATE "product_variants" AS variant
SET "unit_label" = CASE product."kind"
  WHEN 'EGG' THEN 'টি ডিম'
  WHEN 'LOOSE_WEIGHT' THEN 'কেজি'
  WHEN 'LOOSE_VOLUME' THEN 'লিটার'
  ELSE 'ইউনিট'
END
FROM "products" AS product
WHERE product."id" = variant."product_id";

ALTER TABLE "sales_order_items"
  ADD COLUMN "unit_label_snapshot" TEXT NOT NULL DEFAULT 'ইউনিট';

UPDATE "sales_order_items"
SET "unit_label_snapshot" = CASE "quantity_unit"
  WHEN 'GRAM' THEN 'কেজি'
  WHEN 'MILLILITER' THEN 'লিটার'
  ELSE 'ইউনিট'
END;

UPDATE "sales_order_items" AS item
SET "unit_label_snapshot" = 'টি ডিম'
FROM "products" AS product
WHERE product."id" = item."product_id"
  AND product."kind" = 'EGG';
