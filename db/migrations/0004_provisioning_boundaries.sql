-- DPM-Assure provisioning boundary.
-- The schema/migration owner is a trusted provisioning principal and MUST NOT be used by the
-- runtime web application. Runtime must connect with a distinct non-owner role without BYPASSRLS.
-- RLS remains enabled; NO FORCE permits the owning provisioning principal to bootstrap identity
-- and global control-library records on managed PostgreSQL services where superuser is unavailable.

ALTER TABLE organizations NO FORCE ROW LEVEL SECURITY;
ALTER TABLE users NO FORCE ROW LEVEL SECURITY;
ALTER TABLE controls NO FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE organizations IS 'RLS-enabled tenant root. Schema owner may provision; runtime app role must be a non-owner without BYPASSRLS.';
COMMENT ON TABLE users IS 'RLS-enabled identity table. Trusted provisioning owner bootstraps users; runtime app role is subject to RLS.';
COMMENT ON TABLE controls IS 'RLS-enabled control library. Global controls are provisioned by trusted schema owner; tenant controls by authorized runtime flows.';
