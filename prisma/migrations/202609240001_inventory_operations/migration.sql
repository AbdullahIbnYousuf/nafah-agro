CREATE TYPE "InventoryOperationType" AS ENUM ('STOCK_LOSS', 'ENTRY_CORRECTION', 'STOCK_RECONCILIATION');

CREATE TABLE "inventory_operations" (
  "id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "type" "InventoryOperationType" NOT NULL,
  "effective_date" DATE NOT NULL,
  "note" TEXT,
  "quantity_delta" INTEGER NOT NULL,
  "available_before" INTEGER NOT NULL,
  "reserved_before" INTEGER NOT NULL,
  "on_hand_before" INTEGER NOT NULL,
  "available_after" INTEGER NOT NULL,
  "reserved_after" INTEGER NOT NULL,
  "on_hand_after" INTEGER NOT NULL,
  "actual_physical_stock" INTEGER,
  "previous_unit_buying_cost" DECIMAL(14,2),
  "new_unit_buying_cost" DECIMAL(14,2),
  "inventory_value_impact" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "stock_loss_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "recognized_cost_impact" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "target_stock_batch_id" UUID,
  "created_stock_batch_id" UUID,
  "created_by_profile_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_operations_variant_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT,
  CONSTRAINT "inventory_operations_target_batch_fkey" FOREIGN KEY ("target_stock_batch_id") REFERENCES "stock_batches"("id") ON DELETE RESTRICT,
  CONSTRAINT "inventory_operations_creator_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT,
  CONSTRAINT "inventory_operations_values_valid" CHECK (
    "available_before" >= 0 AND "reserved_before" >= 0 AND "on_hand_before" = "available_before" + "reserved_before"
    AND "available_after" >= 0 AND "reserved_after" >= 0 AND "on_hand_after" = "available_after" + "reserved_after"
    AND ("actual_physical_stock" IS NULL OR "actual_physical_stock" >= 0)
  )
);

CREATE TABLE "inventory_operation_allocations" (
  "id" UUID NOT NULL,
  "inventory_operation_id" UUID NOT NULL,
  "stock_batch_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_buying_cost" DECIMAL(14,2) NOT NULL,
  "total_buying_cost" DECIMAL(14,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_operation_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_operation_allocations_operation_fkey" FOREIGN KEY ("inventory_operation_id") REFERENCES "inventory_operations"("id") ON DELETE RESTRICT,
  CONSTRAINT "inventory_operation_allocations_batch_fkey" FOREIGN KEY ("stock_batch_id") REFERENCES "stock_batches"("id") ON DELETE RESTRICT,
  CONSTRAINT "inventory_operation_allocations_quantity_valid" CHECK ("quantity" > 0 AND "unit_buying_cost" > 0 AND "total_buying_cost" >= 0)
);

CREATE TABLE "inventory_cost_correction_allocations" (
  "id" UUID NOT NULL,
  "inventory_operation_id" UUID NOT NULL,
  "order_allocation_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "previous_unit_buying_cost" DECIMAL(14,2) NOT NULL,
  "new_unit_buying_cost" DECIMAL(14,2) NOT NULL,
  "total_cost_delta" DECIMAL(14,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_cost_correction_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_cost_correction_allocations_operation_fkey" FOREIGN KEY ("inventory_operation_id") REFERENCES "inventory_operations"("id") ON DELETE RESTRICT,
  CONSTRAINT "inventory_cost_correction_allocations_order_allocation_fkey" FOREIGN KEY ("order_allocation_id") REFERENCES "order_allocations"("id") ON DELETE RESTRICT,
  CONSTRAINT "inventory_cost_correction_allocations_quantity_valid" CHECK ("quantity" > 0)
);

ALTER TABLE "stock_batches" DROP CONSTRAINT "stock_batches_quantities_valid";
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_quantities_valid" CHECK (
  "purchased_quantity" >= 0
  AND "available_quantity" >= 0
  AND "reserved_quantity" >= 0
  AND "available_quantity" + "reserved_quantity" <= "purchased_quantity"
);
ALTER TABLE "inventory_operations" ADD CONSTRAINT "inventory_operations_created_batch_fkey" FOREIGN KEY ("created_stock_batch_id") REFERENCES "stock_batches"("id") ON DELETE RESTRICT;

CREATE INDEX "inventory_operations_variant_date_idx" ON "inventory_operations"("product_variant_id", "effective_date", "created_at");
CREATE INDEX "inventory_operations_type_date_idx" ON "inventory_operations"("type", "effective_date");
CREATE INDEX "inventory_operations_target_batch_idx" ON "inventory_operations"("target_stock_batch_id");
CREATE INDEX "inventory_operation_allocations_operation_idx" ON "inventory_operation_allocations"("inventory_operation_id");
CREATE INDEX "inventory_operation_allocations_batch_idx" ON "inventory_operation_allocations"("stock_batch_id");
CREATE UNIQUE INDEX "inventory_cost_correction_allocations_operation_order_key" ON "inventory_cost_correction_allocations"("inventory_operation_id", "order_allocation_id");
CREATE INDEX "inventory_cost_correction_allocations_order_idx" ON "inventory_cost_correction_allocations"("order_allocation_id");

ALTER TABLE "inventory_operations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_operation_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_cost_correction_allocations" ENABLE ROW LEVEL SECURITY;
