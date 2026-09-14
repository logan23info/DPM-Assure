-- DPM-Assure authentication bootstrap helpers.
-- The runtime application uses a non-owner role subject to tenant RLS. Authentication and
-- membership discovery necessarily occur before an organization tenant has been selected, so
-- these helpers are deliberately narrow SECURITY DEFINER boundaries.

CREATE OR REPLACE FUNCTION auth_resolve_session(p_token_hash char(64))
RETURNS TABLE (
  session_id uuid,
  user_id uuid,
  email text,
  issued_at timestamptz,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT s.id, s.user_id, u.email, s.issued_at, s.expires_at
  FROM auth_sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = p_token_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
    AND u.status = 'ACTIVE'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION auth_resolve_session(char(64)) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_resolve_session(char(64)) TO PUBLIC;

COMMENT ON FUNCTION auth_resolve_session(char(64)) IS
  'RLS-safe authentication bootstrap. Resolves only a valid active session by its server-computed token hash.';

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
