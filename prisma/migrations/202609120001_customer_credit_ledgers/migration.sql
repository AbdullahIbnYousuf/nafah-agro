CREATE TABLE "credit_customers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "phone" TEXT,
  "next_follow_up_date" DATE,
  "created_by_profile_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "credit_customers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_customers_name_not_blank" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "credit_customers_normalized_name_not_blank" CHECK (length(btrim("normalized_name")) > 0)
);

CREATE TABLE "credit_customer_payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "credit_customer_id" UUID NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "paid_on" DATE NOT NULL,
  "note" TEXT,
  "created_by_profile_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voided_at" TIMESTAMP(3),
  "voided_by_profile_id" UUID,
  "void_reason" TEXT,

  CONSTRAINT "credit_customer_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_customer_payments_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "credit_customer_payments_void_fields_consistent" CHECK (
    ("voided_at" IS NULL AND "voided_by_profile_id" IS NULL AND "void_reason" IS NULL)
    OR
    ("voided_at" IS NOT NULL AND "voided_by_profile_id" IS NOT NULL AND "void_reason" IS NOT NULL AND length(btrim("void_reason")) >= 3)
  )
);

CREATE TABLE "credit_customer_payment_allocations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "credit_payment_id" UUID NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "credit_customer_payment_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_customer_payment_allocations_amount_positive" CHECK ("amount" > 0)
);

ALTER TABLE "sales_orders" ADD COLUMN "credit_customer_id" UUID;

CREATE UNIQUE INDEX "credit_customers_normalized_name_key" ON "credit_customers"("normalized_name");
CREATE INDEX "credit_customers_next_follow_up_date_idx" ON "credit_customers"("next_follow_up_date");
CREATE UNIQUE INDEX "credit_customer_payments_idempotency_key_key" ON "credit_customer_payments"("idempotency_key");
CREATE INDEX "credit_customer_payments_credit_customer_id_paid_on_created_at_idx" ON "credit_customer_payments"("credit_customer_id", "paid_on", "created_at");
CREATE UNIQUE INDEX "credit_customer_payment_allocations_credit_payment_id_sales_order_id_key" ON "credit_customer_payment_allocations"("credit_payment_id", "sales_order_id");
CREATE INDEX "credit_customer_payment_allocations_sales_order_id_idx" ON "credit_customer_payment_allocations"("sales_order_id");
CREATE INDEX "sales_orders_credit_customer_id_completed_at_idx" ON "sales_orders"("credit_customer_id", "completed_at");

ALTER TABLE "credit_customers"
  ADD CONSTRAINT "credit_customers_created_by_profile_id_fkey"
  FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_customer_payments"
  ADD CONSTRAINT "credit_customer_payments_credit_customer_id_fkey"
  FOREIGN KEY ("credit_customer_id") REFERENCES "credit_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_customer_payments"
  ADD CONSTRAINT "credit_customer_payments_created_by_profile_id_fkey"
  FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_customer_payments"
  ADD CONSTRAINT "credit_customer_payments_voided_by_profile_id_fkey"
  FOREIGN KEY ("voided_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_customer_payment_allocations"
  ADD CONSTRAINT "credit_customer_payment_allocations_credit_payment_id_fkey"
  FOREIGN KEY ("credit_payment_id") REFERENCES "credit_customer_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_customer_payment_allocations"
  ADD CONSTRAINT "credit_customer_payment_allocations_sales_order_id_fkey"
  FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_orders"
  ADD CONSTRAINT "sales_orders_credit_customer_id_fkey"
  FOREIGN KEY ("credit_customer_id") REFERENCES "credit_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
