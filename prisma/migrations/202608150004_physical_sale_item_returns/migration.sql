CREATE TABLE "physical_sale_returns" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sales_order_id" UUID NOT NULL,
  "condition" "ReturnCondition" NOT NULL,
  "reason" TEXT NOT NULL,
  "refund_amount" DECIMAL(14,2) NOT NULL,
  "reversed_buying_cost" DECIMAL(14,2) NOT NULL,
  "reversed_gross_profit" DECIMAL(14,2) NOT NULL,
  "created_by_profile_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "physical_sale_returns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "physical_sale_returns_values_valid" CHECK (
    btrim("reason") <> ''
    AND "refund_amount" >= 0
    AND "reversed_buying_cost" >= 0
    AND "reversed_gross_profit" = "refund_amount" - "reversed_buying_cost"
  ),
  CONSTRAINT "physical_sale_returns_order_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT,
  CONSTRAINT "physical_sale_returns_creator_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT
);

CREATE TABLE "physical_sale_return_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "physical_sale_return_id" UUID NOT NULL,
  "sales_order_item_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "refund_amount" DECIMAL(14,2) NOT NULL,
  "reversed_buying_cost" DECIMAL(14,2) NOT NULL,
  "reversed_gross_profit" DECIMAL(14,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "physical_sale_return_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "physical_sale_return_items_values_valid" CHECK (
    "quantity" > 0
    AND "refund_amount" >= 0
    AND "reversed_buying_cost" >= 0
    AND "reversed_gross_profit" = "refund_amount" - "reversed_buying_cost"
  ),
  CONSTRAINT "physical_sale_return_items_return_fkey" FOREIGN KEY ("physical_sale_return_id") REFERENCES "physical_sale_returns"("id") ON DELETE RESTRICT,
  CONSTRAINT "physical_sale_return_items_order_item_fkey" FOREIGN KEY ("sales_order_item_id") REFERENCES "sales_order_items"("id") ON DELETE RESTRICT
);

CREATE TABLE "physical_sale_return_allocations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "physical_sale_return_item_id" UUID NOT NULL,
  "order_allocation_id" UUID NOT NULL,
  "restored_stock_batch_id" UUID,
  "quantity" INTEGER NOT NULL,
  "unit_buying_cost" DECIMAL(14,2) NOT NULL,
  "total_buying_cost" DECIMAL(14,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "physical_sale_return_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "physical_sale_return_allocations_values_valid" CHECK (
    "quantity" > 0
    AND "unit_buying_cost" > 0
    AND "total_buying_cost" >= 0
  ),
  CONSTRAINT "physical_sale_return_allocations_item_fkey" FOREIGN KEY ("physical_sale_return_item_id") REFERENCES "physical_sale_return_items"("id") ON DELETE RESTRICT,
  CONSTRAINT "physical_sale_return_allocations_allocation_fkey" FOREIGN KEY ("order_allocation_id") REFERENCES "order_allocations"("id") ON DELETE RESTRICT,
  CONSTRAINT "physical_sale_return_allocations_batch_fkey" FOREIGN KEY ("restored_stock_batch_id") REFERENCES "stock_batches"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "physical_sale_return_items_return_order_item_key"
ON "physical_sale_return_items"("physical_sale_return_id", "sales_order_item_id");
CREATE UNIQUE INDEX "physical_sale_return_allocations_restored_batch_key"
ON "physical_sale_return_allocations"("restored_stock_batch_id");
CREATE INDEX "physical_sale_returns_order_created_idx"
ON "physical_sale_returns"("sales_order_id", "created_at");
CREATE INDEX "physical_sale_return_items_order_item_idx"
ON "physical_sale_return_items"("sales_order_item_id");
CREATE INDEX "physical_sale_return_allocations_item_idx"
ON "physical_sale_return_allocations"("physical_sale_return_item_id");
CREATE INDEX "physical_sale_return_allocations_allocation_idx"
ON "physical_sale_return_allocations"("order_allocation_id");
