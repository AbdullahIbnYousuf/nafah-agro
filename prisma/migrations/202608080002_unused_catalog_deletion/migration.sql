-- Selling-price history remains immutable during normal operation. A narrowly
-- scoped transaction-local flag allows the OWNER-only unused-product workflow
-- to remove setup-only price rows immediately before deleting that product.
CREATE OR REPLACE FUNCTION public.reject_selling_price_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('nafah.allow_unused_catalog_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'selling price history is immutable';
END;
$$;
