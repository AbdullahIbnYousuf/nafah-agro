-- Multiple active OWNER profiles are allowed. The controlled owner-creation
-- command remains the only way to grant OWNER privileges.
DROP INDEX IF EXISTS "profiles_single_owner_key";

-- Do not silently turn a historical ADMIN into an OWNER or CUSTOMER. Resolve
-- such a profile deliberately before this migration if one exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'ADMIN') THEN
    RAISE EXCEPTION 'Resolve existing ADMIN profiles before applying the two-role migration';
  END IF;
END;
$$;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_customer_phone_required;
ALTER TYPE public."Role" RENAME TO "Role_legacy";
CREATE TYPE public."Role" AS ENUM ('OWNER', 'CUSTOMER');
ALTER TABLE public.profiles
  ALTER COLUMN role TYPE public."Role"
  USING (role::text::public."Role");
DROP TYPE public."Role_legacy";
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_customer_phone_required
  CHECK (
    role <> 'CUSTOMER'
    OR (phone_number IS NOT NULL AND btrim(phone_number) <> '')
  );

-- Never permit an update or deletion to remove the final active OWNER. This
-- also protects against a cascading profile deletion from auth.users.
CREATE OR REPLACE FUNCTION public.prevent_last_active_owner_loss()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  loses_active_owner boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    loses_active_owner := OLD.role = 'OWNER' AND OLD.is_active = true;
  ELSIF TG_OP = 'UPDATE' THEN
    loses_active_owner := OLD.role = 'OWNER'
      AND OLD.is_active = true
      AND (NEW.role <> 'OWNER' OR NEW.is_active = false);
  END IF;

  IF loses_active_owner THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('nafah-active-owner-guard', 0)
    );

    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE role = 'OWNER'
        AND is_active = true
        AND id <> OLD.id
    ) THEN
      RAISE EXCEPTION 'At least one active OWNER profile is required';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_last_active_owner_guard ON public.profiles;
CREATE TRIGGER profiles_last_active_owner_guard
BEFORE UPDATE OF role, is_active OR DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_last_active_owner_loss();
