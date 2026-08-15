-- Selling prices are stored per piece for packaged products and per kg/litre
-- for loose products. Measured sale quantities are stored in grams/millilitres,
-- so their line revenue must be scaled by 1,000 before rounding to currency.
ALTER TABLE "sales_order_items"
DROP CONSTRAINT "sales_order_items_values_valid";

ALTER TABLE "sales_order_items"
ADD CONSTRAINT "sales_order_items_values_valid" CHECK (
  "quantity" > 0
  AND "unit_selling_price" >= 0
  AND "gross_line_revenue" = CASE
    WHEN "quantity_unit" = 'PIECE' THEN "unit_selling_price" * "quantity"
    ELSE round(("unit_selling_price" * "quantity") / 1000, 2)
  END
  AND "allocated_discount" >= 0
  AND "allocated_discount" <= "gross_line_revenue"
  AND "net_line_revenue" = "gross_line_revenue" - "allocated_discount"
  AND (
    ("total_buying_cost" IS NULL AND "gross_profit" IS NULL)
    OR (
      "total_buying_cost" IS NOT NULL
      AND "gross_profit" = "net_line_revenue" - "total_buying_cost"
    )
  )
);
