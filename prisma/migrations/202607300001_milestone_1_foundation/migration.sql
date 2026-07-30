CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'CUSTOMER');

CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone_number" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "profiles_auth_user_fkey"
      FOREIGN KEY ("id") REFERENCES auth.users("id") ON DELETE CASCADE
);

CREATE TABLE "foundation_records" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "foundation_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "foundation_records_key_key" ON "foundation_records"("key");

-- V1 has one controlled OWNER identity. Multiple ADMIN profiles are allowed.
CREATE UNIQUE INDEX "profiles_single_owner_key"
  ON "profiles" ("role")
  WHERE "role" = 'OWNER';

-- These tables are not exposed directly through Supabase's Data API in V1.
-- The Express backend connects as the database owner and is the only data path.
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "foundation_records" ENABLE ROW LEVEL SECURITY;
