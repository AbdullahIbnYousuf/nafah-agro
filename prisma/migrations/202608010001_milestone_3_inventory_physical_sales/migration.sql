CREATE TYPE "StockBatchSource" AS ENUM ('PURCHASE', 'ADJUSTMENT');
CREATE TYPE "StockAdjustmentDirection" AS ENUM ('INCREASE', 'DECREASE');
CREATE TYPE "AllocationState" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');
CREATE TYPE "SalesOrderSource" AS ENUM ('PHYSICAL_SHOP');
CREATE TYPE "SalesOrderStatus" AS ENUM ('COMPLETED');
CREATE TYPE "SalesPaymentMethod" AS ENUM ('CASH');
CREATE TYPE "SalesPaymentStatus" AS ENUM ('PAID');

CREATE TABLE "stock_batches" (
  "id" UUID NOT NULL,
  "purchase_group_id" UUID,
  "product_variant_id" UUID NOT NULL,
  "source" "StockBatchSource" NOT NULL,
  "purchased_quantity" INTEGER NOT NULL,
  "available_quantity" INTEGER NOT NULL,
  "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
  "unit_buying_cost" DECIMAL(14,2) NOT NULL,
  "purchase_date" DATE NOT NULL,
  "note" TEXT,
  "adjustment_reason" TEXT,
  "created_by_profile_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stock_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_batches_variant_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT,
  CONSTRAINT "stock_batches_creator_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT,
  CONSTRAINT "stock_batches_quantities_valid" CHECK (
    "purchased_quantity" > 0
    AND "available_quantity" >= 0
    AND "reserved_quantity" >= 0
    AND "available_quantity" + "reserved_quantity" <= "purchased_quantity"
  ),
  CONSTRAINT "stock_batches_buying_cost_positive" CHECK ("unit_buying_cost" > 0),
  CONSTRAINT "stock_batches_adjustment_reason_required" CHECK (
    "source" <> 'ADJUSTMENT'
    OR ("adjustment_reason" IS NOT NULL AND btrim("adjustment_reason") <> '')
  )
);

CREATE TABLE "stock_adjustments" (
  "id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "direction" "StockAdjustmentDirection" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_buying_cost" DECIMAL(14,2),
  "reason" TEXT NOT NULL,
  "created_by_profile_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_adjustments_variant_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT,
  CONSTRAINT "stock_adjustments_creator_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT,
  CONSTRAINT "stock_adjustments_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "stock_adjustments_reason_required" CHECK (btrim("reason") <> ''),
  CONSTRAINT "stock_adjustments_cost_by_direction" CHECK (
    ("direction" = 'INCREASE' AND "unit_buying_cost" > 0)
    OR ("direction" = 'DECREASE' AND "unit_buying_cost" IS NULL)
  )
);

CREATE TABLE "sales_orders" (
  "id" UUID NOT NULL,
  "order_number" TEXT NOT NULL,
  "source" "SalesOrderSource" NOT NULL DEFAULT 'PHYSICAL_SHOP',
  "status" "SalesOrderStatus" NOT NULL DEFAULT 'COMPLETED',
  "payment_method" "SalesPaymentMethod" NOT NULL DEFAULT 'CASH',
  "payment_status" "SalesPaymentStatus" NOT NULL DEFAULT 'PAID',
  "customer_name" TEXT,
  "customer_phone" TEXT,
  "subtotal" DECIMAL(14,2) NOT NULL,
  "discount_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "grand_total" DECIMAL(14,2) NOT NULL,
  "total_buying_cost" DECIMAL(14,2) NOT NULL,
  "gross_profit" DECIMAL(14,2) NOT NULL,
  "gross_profit_margin" DECIMAL(7,4),
  "unprofitable_override_confirmed" BOOLEAN NOT NULL DEFAULT false,
  "unprofitable_override_by_profile_id" UUID,
  "created_by_profile_id" UUID NOT NULL,
  "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_orders_creator_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT,
  CONSTRAINT "sales_orders_override_actor_fkey" FOREIGN KEY ("unprofitable_override_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT,
  CONSTRAINT "sales_orders_money_valid" CHECK (
    "subtotal" >= 0
    AND "discount_total" >= 0
    AND "discount_total" <= "subtotal"
    AND "grand_total" = "subtotal" - "discount_total"
    AND "gross_profit" = "grand_total" - "total_buying_cost"
  ),
  CONSTRAINT "sales_orders_override_valid" CHECK (
    ("gross_profit" >= 0 AND "unprofitable_override_confirmed" = false AND "unprofitable_override_by_profile_id" IS NULL)
    OR ("gross_profit" < 0 AND "unprofitable_override_confirmed" = true AND "unprofitable_override_by_profile_id" IS NOT NULL)
  )
);

CREATE TABLE "sales_order_items" (
  "id" UUID NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "product_name_snapshot" TEXT NOT NULL,
  "variant_name_snapshot" TEXT NOT NULL,
  "sku_snapshot" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_selling_price" DECIMAL(14,2) NOT NULL,
  "gross_line_revenue" DECIMAL(14,2) NOT NULL,
  "allocated_discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "net_line_revenue" DECIMAL(14,2) NOT NULL,
  "total_buying_cost" DECIMAL(14,2) NOT NULL,
  "gross_profit" DECIMAL(14,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_order_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_order_items_order_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT,
  CONSTRAINT "sales_order_items_variant_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT,
  CONSTRAINT "sales_order_items_values_valid" CHECK (
    "quantity" > 0
    AND "unit_selling_price" >= 0
    AND "gross_line_revenue" = "unit_selling_price" * "quantity"
    AND "allocated_discount" >= 0
    AND "allocated_discount" <= "gross_line_revenue"
    AND "net_line_revenue" = "gross_line_revenue" - "allocated_discount"
    AND "gross_profit" = "net_line_revenue" - "total_buying_cost"
  )
);

CREATE TABLE "order_allocations" (
  "id" UUID NOT NULL,
  "sales_order_item_id" UUID NOT NULL,
  "stock_batch_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_buying_cost" DECIMAL(14,2) NOT NULL,
  "total_buying_cost" DECIMAL(14,2) NOT NULL,
  "state" "AllocationState" NOT NULL DEFAULT 'CONSUMED',
  "reserved_at" TIMESTAMP(3),
  "consumed_at" TIMESTAMP(3),
  "released_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "order_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_allocations_item_fkey" FOREIGN KEY ("sales_order_item_id") REFERENCES "sales_order_items"("id") ON DELETE RESTRICT,
  CONSTRAINT "order_allocations_batch_fkey" FOREIGN KEY ("stock_batch_id") REFERENCES "stock_batches"("id") ON DELETE RESTRICT,
  CONSTRAINT "order_allocations_values_valid" CHECK (
    "quantity" > 0
    AND "unit_buying_cost" > 0
    AND "total_buying_cost" = "unit_buying_cost" * "quantity"
  ),
  CONSTRAINT "order_allocations_consumed_time_required" CHECK (
    "state" <> 'CONSUMED' OR "consumed_at" IS NOT NULL
  )
);

CREATE UNIQUE INDEX "sales_orders_order_number_key" ON "sales_orders"("order_number");
CREATE INDEX "stock_batches_variant_fifo_idx" ON "stock_batches"("product_variant_id", "purchase_date", "created_at");
CREATE INDEX "stock_batches_purchase_group_idx" ON "stock_batches"("purchase_group_id");
CREATE INDEX "stock_adjustments_variant_created_idx" ON "stock_adjustments"("product_variant_id", "created_at");
CREATE INDEX "sales_orders_completed_at_idx" ON "sales_orders"("completed_at");
CREATE INDEX "sales_order_items_order_idx" ON "sales_order_items"("sales_order_id");
CREATE INDEX "sales_order_items_variant_idx" ON "sales_order_items"("product_variant_id");
CREATE INDEX "order_allocations_item_idx" ON "order_allocations"("sales_order_item_id");
CREATE INDEX "order_allocations_batch_state_idx" ON "order_allocations"("stock_batch_id", "state");

ALTER TABLE "stock_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_allocations" ENABLE ROW LEVEL SECURITY;
