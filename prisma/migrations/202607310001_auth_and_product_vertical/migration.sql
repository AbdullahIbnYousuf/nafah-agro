-- Customer self-registration: the browser may request only CUSTOMER. The role
-- written here is hard-coded and never trusted from user-editable metadata.
CREATE OR REPLACE FUNCTION public.create_nafah_customer_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.raw_user_meta_data ->> 'nafah_role' = 'CUSTOMER' THEN
    INSERT INTO public.profiles (id, role, full_name, phone_number, is_active, created_at, updated_at)
    VALUES (
      NEW.id,
      'CUSTOMER',
      COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), 'Customer'),
      NULLIF(NEW.raw_user_meta_data ->> 'phone_number', ''),
      true,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_customer_phone_required
CHECK (
  role <> 'CUSTOMER'
  OR (phone_number IS NOT NULL AND btrim(phone_number) <> '')
);

DROP TRIGGER IF EXISTS create_nafah_customer_profile_after_signup ON auth.users;
CREATE TRIGGER create_nafah_customer_profile_after_signup
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_nafah_customer_profile();

CREATE TABLE "categories" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
  "id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "youtube_links" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "attributes" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT
);

CREATE TABLE "product_variants" (
  "id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "current_selling_price" DECIMAL(14,2) NOT NULL,
  "available_stock" INTEGER NOT NULL DEFAULT 0,
  "reserved_stock" INTEGER NOT NULL DEFAULT 0,
  "low_stock_threshold" INTEGER NOT NULL DEFAULT 5,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
  CONSTRAINT "product_variants_stock_nonnegative" CHECK ("available_stock" >= 0 AND "reserved_stock" >= 0),
  CONSTRAINT "product_variants_price_nonnegative" CHECK ("current_selling_price" >= 0)
);

CREATE TABLE "selling_price_history" (
  "id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "previous_price" DECIMAL(14,2),
  "new_price" DECIMAL(14,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "changed_by_profile_id" UUID NOT NULL,
  "effective_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "selling_price_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "selling_price_history_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT,
  CONSTRAINT "selling_price_history_changed_by_fkey" FOREIGN KEY ("changed_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT,
  CONSTRAINT "selling_price_history_price_nonnegative" CHECK ("new_price" >= 0)
);

CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");
CREATE INDEX "products_category_id_is_active_idx" ON "products"("category_id", "is_active");
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");
CREATE INDEX "product_variants_product_id_is_active_idx" ON "product_variants"("product_id", "is_active");
CREATE UNIQUE INDEX "product_variants_one_default_key" ON "product_variants"("product_id") WHERE "is_default" = true;
CREATE INDEX "selling_price_history_variant_effective_idx" ON "selling_price_history"("variant_id", "effective_at");

ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "selling_price_history" ENABLE ROW LEVEL SECURITY;

-- Price history is append-only even for direct database clients.
CREATE OR REPLACE FUNCTION public.reject_selling_price_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'selling price history is immutable';
END;
$$;

CREATE TRIGGER selling_price_history_immutable
BEFORE UPDATE OR DELETE ON public.selling_price_history
FOR EACH ROW EXECUTE FUNCTION public.reject_selling_price_history_mutation();
