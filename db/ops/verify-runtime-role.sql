\set ON_ERROR_STOP on

\if :{?runtime_role}
\else
  \echo 'runtime_role psql variable is required'
  \quit 1
\endif

SELECT set_config('dpm.runtime_role', :'runtime_role', false);

DO $verify$
DECLARE
  runtime_name text := current_setting('dpm.runtime_role');
  role_row pg_roles%ROWTYPE;
  owned_count integer;
BEGIN
  SELECT * INTO role_row FROM pg_roles WHERE rolname = runtime_name;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'runtime role % does not exist', runtime_name;
  END IF;

  IF role_row.rolsuper OR role_row.rolcreatedb OR role_row.rolcreaterole OR role_row.rolinherit OR role_row.rolbypassrls THEN
    RAISE EXCEPTION 'runtime role % has forbidden elevated attributes', runtime_name;
  END IF;

  SELECT count(*) INTO owned_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_roles r ON r.oid = c.relowner
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r','p','S','v','m','f')
    AND r.rolname = runtime_name;

  IF owned_count <> 0 THEN
    RAISE EXCEPTION 'runtime role % owns % public schema objects', runtime_name, owned_count;
  END IF;

  IF has_schema_privilege(runtime_name, 'public', 'CREATE') THEN
    RAISE EXCEPTION 'runtime role % must not have CREATE on public schema', runtime_name;
  END IF;

  IF NOT has_schema_privilege(runtime_name, 'public', 'USAGE') THEN
    RAISE EXCEPTION 'runtime role % is missing USAGE on public schema', runtime_name;
  END IF;

  IF NOT has_table_privilege(runtime_name, 'public.organizations', 'SELECT') THEN
    RAISE EXCEPTION 'runtime role % is missing required table access', runtime_name;
  END IF;

  IF NOT has_table_privilege(runtime_name, 'public.audit_logs', 'INSERT') THEN
    RAISE EXCEPTION 'runtime role % is missing audit log insert access', runtime_name;
  END IF;
END
$verify$;

SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls
FROM pg_roles
WHERE rolname = :'runtime_role';
