CREATE TYPE "PushNotificationType" AS ENUM ('WEBSITE_ORDER', 'CREDIT_REMINDER', 'TEST');

CREATE TYPE "PushDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_successful_at" TIMESTAMP(3),

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "push_subscriptions_values_valid" CHECK (
      length(trim("endpoint")) > 0
      AND length(trim("p256dh")) > 0
      AND length(trim("auth")) > 0
    )
);

CREATE TABLE "push_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subscription_id" UUID NOT NULL,
    "type" "PushNotificationType" NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "status" "PushDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "failure_code" TEXT,

    CONSTRAINT "push_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX "push_subscriptions_profile_id_updated_at_idx" ON "push_subscriptions"("profile_id", "updated_at");
CREATE UNIQUE INDEX "push_deliveries_dedupe_key_key" ON "push_deliveries"("dedupe_key");
CREATE INDEX "push_deliveries_subscription_id_attempted_at_idx" ON "push_deliveries"("subscription_id", "attempted_at");

ALTER TABLE "push_subscriptions"
ADD CONSTRAINT "push_subscriptions_profile_id_fkey"
FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "push_deliveries"
ADD CONSTRAINT "push_deliveries_subscription_id_fkey"
FOREIGN KEY ("subscription_id") REFERENCES "push_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
