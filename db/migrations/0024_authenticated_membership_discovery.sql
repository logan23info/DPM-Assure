-- DPM-Assure authenticated membership discovery.
-- An authenticated principal must be able to discover its own active organization memberships
-- before an organization_id can be selected for normal tenant RLS transactions.

CREATE OR REPLACE FUNCTION auth_current_user_memberships()
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  organization_slug text,
  role membership_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT m.organization_id, o.name, o.slug, m.role
  FROM memberships m
  JOIN organizations o ON o.id = m.organization_id
  WHERE app_current_user_id() IS NOT NULL
    AND m.user_id = app_current_user_id()
    AND m.status = 'ACTIVE'
    AND o.status = 'ACTIVE'
  ORDER BY o.name ASC
$$;

REVOKE ALL ON FUNCTION auth_current_user_memberships() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_current_user_memberships() TO PUBLIC;

COMMENT ON FUNCTION auth_current_user_memberships() IS
  'RLS-safe bootstrap for the authenticated user to discover only their own active organization memberships before selecting a tenant context.';
