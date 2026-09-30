ALTER TABLE "sales_orders"
  ADD COLUMN "price_increase_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "sold_on" DATE;

ALTER TABLE "sales_order_items"
  ADD COLUMN "allocated_price_increase" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "sales_orders" DROP CONSTRAINT "sales_orders_money_valid";
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_money_valid" CHECK (
  "subtotal" >= 0
  AND "discount_total" >= 0
  AND "discount_total" <= "subtotal"
  AND "price_increase_total" >= 0
  AND ("discount_total" = 0 OR "price_increase_total" = 0)
  AND "delivery_charge" >= 0
  AND "grand_total" = "subtotal" - "discount_total" + "price_increase_total" + "delivery_charge"
  AND (
    ("total_buying_cost" IS NULL AND "gross_profit" IS NULL AND "gross_profit_margin" IS NULL)
    OR (
      "total_buying_cost" IS NOT NULL
      AND "gross_profit" = "subtotal" - "discount_total" + "price_increase_total" - "total_buying_cost"
    )
  )
);

ALTER TABLE "sales_order_items" DROP CONSTRAINT "sales_order_items_values_valid";
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_values_valid" CHECK (
  "quantity" > 0
  AND "unit_selling_price" >= 0
  AND "gross_line_revenue" = CASE
    WHEN "quantity_unit" = 'PIECE' THEN "unit_selling_price" * "quantity"
    ELSE round(("unit_selling_price" * "quantity") / 1000, 2)
  END
  AND "allocated_discount" >= 0
  AND "allocated_discount" <= "gross_line_revenue"
  AND "allocated_price_increase" >= 0
  AND "net_line_revenue" = "gross_line_revenue" - "allocated_discount" + "allocated_price_increase"
  AND (
    ("total_buying_cost" IS NULL AND "gross_profit" IS NULL)
    OR (
      "total_buying_cost" IS NOT NULL
      AND "gross_profit" = "net_line_revenue" - "total_buying_cost"
    )
  )
);

ALTER TABLE "sales_orders" DROP CONSTRAINT "sales_orders_website_idempotency_required";
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_website_idempotency_required" CHECK (
  ("source" = 'WEBSITE' AND "idempotency_key" IS NOT NULL AND "request_fingerprint" IS NOT NULL)
  OR ("source" = 'PHYSICAL_SHOP' AND (("idempotency_key" IS NULL AND "request_fingerprint" IS NULL)
    OR ("idempotency_key" IS NOT NULL AND "request_fingerprint" IS NOT NULL)))
  OR ("source" NOT IN ('WEBSITE', 'PHYSICAL_SHOP') AND "idempotency_key" IS NULL AND "request_fingerprint" IS NULL)
);
