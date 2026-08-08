-- The integrity trigger is shared by product_variants and stock_batches.
-- Resolve the variant id in separate branches so PostgreSQL never attempts to
-- access a column that does not exist on the triggering table's row type.
CREATE OR REPLACE FUNCTION public.validate_variant_stock_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  variant_id uuid;
  cached_available integer;
  cached_reserved integer;
  batch_available bigint;
  batch_reserved bigint;
BEGIN
  IF TG_TABLE_NAME = 'product_variants' THEN
    IF TG_OP = 'DELETE' THEN
      variant_id := OLD.id;
    ELSE
      variant_id := NEW.id;
    END IF;
  ELSIF TG_TABLE_NAME = 'stock_batches' THEN
    IF TG_OP = 'DELETE' THEN
      variant_id := OLD.product_variant_id;
    ELSE
      variant_id := NEW.product_variant_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported stock-integrity trigger table: %', TG_TABLE_NAME;
  END IF;

  SELECT available_stock, reserved_stock
  INTO cached_available, cached_reserved
  FROM public.product_variants
  WHERE id = variant_id;

  -- Deleting a variant is already blocked while batches reference it.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(available_quantity), 0), COALESCE(SUM(reserved_quantity), 0)
  INTO batch_available, batch_reserved
  FROM public.stock_batches
  WHERE product_variant_id = variant_id;

  IF cached_available <> batch_available OR cached_reserved <> batch_reserved THEN
    RAISE EXCEPTION 'Variant cached stock totals do not match stock batches for %', variant_id;
  END IF;
  RETURN NULL;
END;
$$;
