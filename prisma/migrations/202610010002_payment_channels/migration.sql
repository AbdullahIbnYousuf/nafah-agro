CREATE TYPE "PaymentChannel" AS ENUM ('CASH', 'BKASH', 'NAGAD', 'ROCKET', 'BANK');

ALTER TABLE "sales_orders" ADD COLUMN "payment_channel" "PaymentChannel";
ALTER TABLE "credit_customer_payments" ADD COLUMN "payment_channel" "PaymentChannel" NOT NULL DEFAULT 'CASH';
ALTER TABLE "credit_payments" ADD COLUMN "payment_channel" "PaymentChannel" NOT NULL DEFAULT 'CASH';
ALTER TABLE "physical_sale_returns" ADD COLUMN "refund_channel" "PaymentChannel";

-- Existing paid shop sales, repayments, and payouts are treated as cash.
UPDATE "sales_orders" SET "payment_channel" = 'CASH'
WHERE "source" = 'PHYSICAL_SHOP' AND "payment_method" = 'CASH';

UPDATE "physical_sale_returns" SET "refund_channel" = 'CASH'
WHERE "cash_refund_amount" > 0;

CREATE INDEX "sales_orders_payment_channel_sold_on_idx" ON "sales_orders"("payment_channel", "sold_on");
CREATE INDEX "credit_customer_payments_channel_paid_on_idx" ON "credit_customer_payments"("payment_channel", "paid_on");
CREATE INDEX "credit_payments_channel_paid_on_idx" ON "credit_payments"("payment_channel", "paid_on");
CREATE INDEX "physical_sale_returns_channel_created_at_idx" ON "physical_sale_returns"("refund_channel", "created_at");
