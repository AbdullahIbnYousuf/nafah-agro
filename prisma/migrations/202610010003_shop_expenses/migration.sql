CREATE TABLE "shop_expenses" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "paid_on" DATE NOT NULL,
  "payment_channel" "PaymentChannel" NOT NULL DEFAULT 'CASH',
  "note" TEXT,
  "idempotency_key" UUID NOT NULL,
  "request_fingerprint" TEXT NOT NULL,
  "created_by_profile_id" UUID NOT NULL,
  "voided_at" TIMESTAMP(3),
  "void_reason" TEXT,
  "voided_by_profile_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shop_expenses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shop_expenses_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "shop_expenses_void_valid" CHECK (("voided_at" IS NULL AND "void_reason" IS NULL AND "voided_by_profile_id" IS NULL) OR ("voided_at" IS NOT NULL AND "void_reason" IS NOT NULL AND "voided_by_profile_id" IS NOT NULL))
);

CREATE UNIQUE INDEX "shop_expenses_idempotency_key_key" ON "shop_expenses"("idempotency_key");
CREATE INDEX "shop_expenses_paid_on_created_at_idx" ON "shop_expenses"("paid_on", "created_at");
CREATE INDEX "shop_expenses_payment_channel_paid_on_idx" ON "shop_expenses"("payment_channel", "paid_on");
CREATE INDEX "shop_expenses_voided_at_paid_on_idx" ON "shop_expenses"("voided_at", "paid_on");
ALTER TABLE "shop_expenses" ADD CONSTRAINT "shop_expenses_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shop_expenses" ADD CONSTRAINT "shop_expenses_voided_by_profile_id_fkey" FOREIGN KEY ("voided_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
