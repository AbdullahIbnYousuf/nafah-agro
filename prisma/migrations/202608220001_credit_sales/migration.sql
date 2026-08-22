ALTER TYPE "SalesPaymentMethod" ADD VALUE IF NOT EXISTS 'CREDIT';
ALTER TYPE "SalesPaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID';

ALTER TABLE "sales_orders"
  ADD COLUMN "next_follow_up_date" DATE;

ALTER TABLE "physical_sale_returns"
  ADD COLUMN "credit_offset_amount" DECIMAL(14,2),
  ADD COLUMN "cash_refund_amount" DECIMAL(14,2);

UPDATE "physical_sale_returns"
SET
  "credit_offset_amount" = 0,
  "cash_refund_amount" = "refund_amount";

ALTER TABLE "physical_sale_returns"
  ALTER COLUMN "credit_offset_amount" SET NOT NULL,
  ALTER COLUMN "credit_offset_amount" SET DEFAULT 0,
  ALTER COLUMN "cash_refund_amount" SET NOT NULL,
  ALTER COLUMN "cash_refund_amount" SET DEFAULT 0;

ALTER TABLE "physical_sale_returns"
  ADD CONSTRAINT "physical_sale_returns_refund_split_valid" CHECK (
    "credit_offset_amount" >= 0
    AND "cash_refund_amount" >= 0
    AND "credit_offset_amount" + "cash_refund_amount" = "refund_amount"
  );

CREATE TABLE "credit_payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sales_order_id" UUID NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "paid_on" DATE NOT NULL,
  "note" TEXT,
  "created_by_profile_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voided_at" TIMESTAMP(3),
  "voided_by_profile_id" UUID,
  "void_reason" TEXT,

  CONSTRAINT "credit_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_payments_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "credit_payments_void_fields_consistent" CHECK (
    ("voided_at" IS NULL AND "voided_by_profile_id" IS NULL AND "void_reason" IS NULL)
    OR
    ("voided_at" IS NOT NULL AND "voided_by_profile_id" IS NOT NULL AND "void_reason" IS NOT NULL AND length(btrim("void_reason")) >= 3)
  )
);

CREATE UNIQUE INDEX "credit_payments_idempotency_key_key" ON "credit_payments"("idempotency_key");
CREATE INDEX "credit_payments_sales_order_id_paid_on_created_at_idx" ON "credit_payments"("sales_order_id", "paid_on", "created_at");
CREATE INDEX "sales_orders_payment_method_payment_status_next_follow_up_date_idx" ON "sales_orders"("payment_method", "payment_status", "next_follow_up_date");

ALTER TABLE "credit_payments"
  ADD CONSTRAINT "credit_payments_sales_order_id_fkey"
  FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_payments"
  ADD CONSTRAINT "credit_payments_created_by_profile_id_fkey"
  FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_payments"
  ADD CONSTRAINT "credit_payments_voided_by_profile_id_fkey"
  FOREIGN KEY ("voided_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
