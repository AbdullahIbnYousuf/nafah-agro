-- Allocation buying rates are stored per piece for packaged products and per
-- kg/litre for loose products. Allocations do not duplicate the sale item's
-- quantity unit, so accept the exact piece total or the scaled measured total.
ALTER TABLE "order_allocations"
DROP CONSTRAINT "order_allocations_values_valid";

ALTER TABLE "order_allocations"
ADD CONSTRAINT "order_allocations_values_valid" CHECK (
  "quantity" > 0
  AND "unit_buying_cost" > 0
  AND (
    "total_buying_cost" = "unit_buying_cost" * "quantity"
    OR "total_buying_cost" = round(("unit_buying_cost" * "quantity") / 1000, 2)
  )
);
