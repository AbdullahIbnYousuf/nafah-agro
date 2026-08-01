ALTER TYPE "StockBatchSource" ADD VALUE IF NOT EXISTS 'SELLABLE_RETURN';

ALTER TYPE "SalesOrderSource" ADD VALUE IF NOT EXISTS 'WEBSITE';
ALTER TYPE "SalesOrderSource" ADD VALUE IF NOT EXISTS 'FACEBOOK';
ALTER TYPE "SalesOrderSource" ADD VALUE IF NOT EXISTS 'PHONE';
ALTER TYPE "SalesOrderSource" ADD VALUE IF NOT EXISTS 'WHATSAPP';
ALTER TYPE "SalesOrderSource" ADD VALUE IF NOT EXISTS 'OTHER';

ALTER TYPE "SalesOrderStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "SalesOrderStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE "SalesOrderStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "SalesOrderStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "SalesOrderStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "SalesOrderStatus" ADD VALUE IF NOT EXISTS 'RETURNED_SELLABLE';
ALTER TYPE "SalesOrderStatus" ADD VALUE IF NOT EXISTS 'RETURNED_DAMAGED';

ALTER TYPE "SalesPaymentMethod" ADD VALUE IF NOT EXISTS 'CASH_ON_DELIVERY';
ALTER TYPE "SalesPaymentStatus" ADD VALUE IF NOT EXISTS 'UNPAID';
ALTER TYPE "SalesPaymentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

CREATE TYPE "DeliveryRateCode" AS ENUM ('DHAKA', 'OUTSIDE_DHAKA');
CREATE TYPE "ReturnCondition" AS ENUM ('SELLABLE', 'DAMAGED');

CREATE TABLE "delivery_rates" (
  "id" UUID NOT NULL,
  "code" "DeliveryRateCode" NOT NULL,
  "name" TEXT NOT NULL,
  "charge" DECIMAL(14,2),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "updated_by_profile_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_rates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_rates_updater_fkey" FOREIGN KEY ("updated_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT,
  CONSTRAINT "delivery_rates_charge_nonnegative" CHECK ("charge" IS NULL OR "charge" >= 0)
);

CREATE UNIQUE INDEX "delivery_rates_code_key" ON "delivery_rates"("code");

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL,
  "actor_profile_id" UUID,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" UUID NOT NULL,
  "previous_data" JSONB,
  "new_data" JSONB,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_actor_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL
);

CREATE INDEX "audit_logs_entity_created_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

-- Charges deliberately remain NULL until the client approves them.
INSERT INTO "delivery_rates" ("id", "code", "name") VALUES
  ('d0000000-0000-4000-8000-000000000001', 'DHAKA', 'Dhaka'),
  ('d0000000-0000-4000-8000-000000000002', 'OUTSIDE_DHAKA', 'Outside Dhaka');

ALTER TABLE "sales_orders" DROP CONSTRAINT "sales_orders_money_valid";
ALTER TABLE "sales_orders" DROP CONSTRAINT "sales_orders_override_valid";
ALTER TABLE "sales_order_items" DROP CONSTRAINT "sales_order_items_values_valid";

ALTER TABLE "sales_orders"
  ADD COLUMN "idempotency_key" TEXT,
  ADD COLUMN "request_fingerprint" TEXT,
  ADD COLUMN "customer_profile_id" UUID,
  ADD COLUMN "customer_email" TEXT,
  ADD COLUMN "customer_address" TEXT,
  ADD COLUMN "delivery_rate_id" UUID,
  ADD COLUMN "delivery_charge" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "confirmed_at" TIMESTAMP(3),
  ADD COLUMN "delivered_at" TIMESTAMP(3),
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "returned_at" TIMESTAMP(3),
  ADD COLUMN "status_reason" TEXT,
  ADD COLUMN "return_condition" "ReturnCondition",
  ALTER COLUMN "created_by_profile_id" DROP NOT NULL,
  ALTER COLUMN "completed_at" DROP NOT NULL,
  ALTER COLUMN "completed_at" DROP DEFAULT,
  ALTER COLUMN "total_buying_cost" DROP NOT NULL,
  ALTER COLUMN "gross_profit" DROP NOT NULL;

ALTER TABLE "sales_order_items"
  ALTER COLUMN "total_buying_cost" DROP NOT NULL,
  ALTER COLUMN "gross_profit" DROP NOT NULL;

ALTER TABLE "stock_batches" ADD COLUMN "source_sales_order_id" UUID;

ALTER TABLE "sales_orders"
  ADD CONSTRAINT "sales_orders_customer_profile_fkey" FOREIGN KEY ("customer_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "sales_orders_delivery_rate_fkey" FOREIGN KEY ("delivery_rate_id") REFERENCES "delivery_rates"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "sales_orders_money_valid" CHECK (
    "subtotal" >= 0
    AND "discount_total" >= 0
    AND "discount_total" <= "subtotal"
    AND "delivery_charge" >= 0
    AND "grand_total" = "subtotal" - "discount_total" + "delivery_charge"
    AND (
      ("total_buying_cost" IS NULL AND "gross_profit" IS NULL AND "gross_profit_margin" IS NULL)
      OR (
        "total_buying_cost" IS NOT NULL
        AND "gross_profit" = "subtotal" - "discount_total" - "total_buying_cost"
      )
    )
  ),
  ADD CONSTRAINT "sales_orders_override_valid" CHECK (
    ("gross_profit" IS NULL AND "unprofitable_override_confirmed" = false AND "unprofitable_override_by_profile_id" IS NULL)
    OR ("gross_profit" >= 0 AND "unprofitable_override_confirmed" = false AND "unprofitable_override_by_profile_id" IS NULL)
    OR ("gross_profit" < 0 AND "unprofitable_override_confirmed" = true AND "unprofitable_override_by_profile_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "sales_orders_delivery_fields_required" CHECK (
    "source" = 'PHYSICAL_SHOP'
    OR (
      "customer_name" IS NOT NULL AND btrim("customer_name") <> ''
      AND "customer_phone" IS NOT NULL AND btrim("customer_phone") <> ''
      AND "customer_address" IS NOT NULL AND btrim("customer_address") <> ''
      AND "delivery_rate_id" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "sales_orders_website_idempotency_required" CHECK (
    ("source" = 'WEBSITE' AND "idempotency_key" IS NOT NULL AND "request_fingerprint" IS NOT NULL)
    OR ("source" <> 'WEBSITE' AND "idempotency_key" IS NULL AND "request_fingerprint" IS NULL)
  ),
  ADD CONSTRAINT "sales_orders_return_fields_valid" CHECK (
    ("status" = 'RETURNED_SELLABLE' AND "return_condition" = 'SELLABLE' AND "returned_at" IS NOT NULL)
    OR ("status" = 'RETURNED_DAMAGED' AND "return_condition" = 'DAMAGED' AND "returned_at" IS NOT NULL)
    OR ("status" NOT IN ('RETURNED_SELLABLE', 'RETURNED_DAMAGED') AND "return_condition" IS NULL)
  );

ALTER TABLE "sales_order_items"
  ADD CONSTRAINT "sales_order_items_values_valid" CHECK (
    "quantity" > 0
    AND "unit_selling_price" >= 0
    AND "gross_line_revenue" = "unit_selling_price" * "quantity"
    AND "allocated_discount" >= 0
    AND "allocated_discount" <= "gross_line_revenue"
    AND "net_line_revenue" = "gross_line_revenue" - "allocated_discount"
    AND (
      ("total_buying_cost" IS NULL AND "gross_profit" IS NULL)
      OR ("total_buying_cost" IS NOT NULL AND "gross_profit" = "net_line_revenue" - "total_buying_cost")
    )
  );

ALTER TABLE "stock_batches"
  ADD CONSTRAINT "stock_batches_source_order_fkey" FOREIGN KEY ("source_sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT;

CREATE UNIQUE INDEX "sales_orders_idempotency_key_key" ON "sales_orders"("idempotency_key");
CREATE INDEX "sales_orders_source_status_placed_idx" ON "sales_orders"("source", "status", "placed_at");
CREATE INDEX "sales_orders_customer_profile_placed_idx" ON "sales_orders"("customer_profile_id", "placed_at");
CREATE INDEX "sales_orders_customer_phone_idx" ON "sales_orders"("customer_phone");

ALTER TABLE "delivery_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_no_update_delete"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
