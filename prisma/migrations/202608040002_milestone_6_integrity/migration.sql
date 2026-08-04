-- Validate the cached variant totals against authoritative batch quantities at
-- transaction commit. Application services still update both sides in one
-- transaction; this constraint catches regressions and unsafe manual writes.
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
  variant_id := CASE
    WHEN TG_TABLE_NAME = 'product_variants' THEN COALESCE(NEW.id, OLD.id)
    ELSE COALESCE(NEW.product_variant_id, OLD.product_variant_id)
  END;

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

-- A stock batch belongs to the variant it was purchased/created for. Moving it
-- would rewrite inventory identity and could leave the old variant's cached
-- totals inconsistent; corrections must use the audited adjustment workflow.
CREATE OR REPLACE FUNCTION public.prevent_stock_batch_variant_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.product_variant_id IS DISTINCT FROM OLD.product_variant_id THEN
    RAISE EXCEPTION 'A stock batch cannot be reassigned to another variant';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stock_batches_variant_immutable
BEFORE UPDATE OF product_variant_id ON public.stock_batches
FOR EACH ROW EXECUTE FUNCTION public.prevent_stock_batch_variant_change();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.product_variants pv
    LEFT JOIN public.stock_batches sb ON sb.product_variant_id = pv.id
    GROUP BY pv.id, pv.available_stock, pv.reserved_stock
    HAVING pv.available_stock <> COALESCE(SUM(sb.available_quantity), 0)
       OR pv.reserved_stock <> COALESCE(SUM(sb.reserved_quantity), 0)
  ) THEN
    RAISE EXCEPTION 'Existing variant cached stock totals do not match stock batches';
  END IF;
END;
$$;

CREATE CONSTRAINT TRIGGER product_variants_stock_totals_consistent
AFTER INSERT OR UPDATE OF available_stock, reserved_stock ON public.product_variants
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_variant_stock_totals();

CREATE CONSTRAINT TRIGGER stock_batches_variant_totals_consistent
AFTER INSERT OR UPDATE OF available_quantity, reserved_quantity, product_variant_id OR DELETE ON public.stock_batches
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_variant_stock_totals();

ALTER TABLE public.order_allocations
  ADD CONSTRAINT order_allocations_state_timestamps_valid CHECK (
    (state = 'RESERVED' AND reserved_at IS NOT NULL AND consumed_at IS NULL AND released_at IS NULL)
    OR (state = 'CONSUMED' AND consumed_at IS NOT NULL AND released_at IS NULL)
    OR (state = 'RELEASED' AND reserved_at IS NOT NULL AND consumed_at IS NULL AND released_at IS NOT NULL)
  );

ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_status_reason_required CHECK (
    status NOT IN ('CANCELLED', 'FAILED_DELIVERY')
    OR (status_reason IS NOT NULL AND btrim(status_reason) <> '')
  ),
  ADD CONSTRAINT sales_orders_return_reason_required CHECK (
    status NOT IN ('RETURNED_SELLABLE', 'RETURNED_DAMAGED')
    OR (status_reason IS NOT NULL AND btrim(status_reason) <> '')
  );
