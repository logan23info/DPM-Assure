\set ON_ERROR_STOP on

BEGIN;

INSERT INTO users(id,email,display_name) VALUES
 ('a1000000-0000-0000-0000-000000000001','auth-user@example.test','Auth User');

INSERT INTO auth_login_tokens(
 id,email,token_hash,requested_at,expires_at
) VALUES (
 'a2000000-0000-0000-0000-000000000001',
 'auth-user@example.test',
 repeat('a',64),
 '2026-01-01T00:00:00Z',
 '2026-01-01T00:15:00Z'
);

DO $$
DECLARE consumed_email text;
BEGIN
  consumed_email := consume_login_token(repeat('a',64)::char(64), '2026-01-01T00:05:00Z');
  IF consumed_email <> 'auth-user@example.test' THEN
    RAISE EXCEPTION 'valid login token did not return expected email';
  END IF;

  BEGIN
    PERFORM consume_login_token(repeat('a',64)::char(64), '2026-01-01T00:06:00Z');
    RAISE EXCEPTION 'expected consumed login token replay to fail';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Login token is invalid%' THEN RAISE; END IF;
  END;
END $$;

INSERT INTO auth_login_tokens(
 id,email,token_hash,requested_at,expires_at
) VALUES (
 'a2000000-0000-0000-0000-000000000002',
 'expired@example.test',
 repeat('b',64),
 '2026-01-01T00:00:00Z',
 '2026-01-01T00:01:00Z'
);

DO $$
BEGIN
  BEGIN
    PERFORM consume_login_token(repeat('b',64)::char(64), '2026-01-01T00:02:00Z');
    RAISE EXCEPTION 'expected expired login token to fail';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Login token is invalid%' THEN RAISE; END IF;
  END;
END $$;

INSERT INTO auth_sessions(
 id,user_id,token_hash,issued_at,expires_at
) VALUES (
 'a3000000-0000-0000-0000-000000000001',
 'a1000000-0000-0000-0000-000000000001',
 repeat('c',64),
 '2026-01-01T00:00:00Z',
 '2026-01-02T00:00:00Z'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO auth_sessions(user_id,token_hash,issued_at,expires_at)
    VALUES (
      'a1000000-0000-0000-0000-000000000001',
      repeat('x',64),
      '2026-01-01T00:00:00Z',
      '2026-01-02T00:00:00Z'
    );
    RAISE EXCEPTION 'expected malformed session hash to fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

UPDATE auth_sessions
SET revoked_at='2026-01-01T01:00:00Z'
WHERE id='a3000000-0000-0000-0000-000000000001';

DO $$
DECLARE revoked timestamptz;
BEGIN
  SELECT revoked_at INTO revoked
  FROM auth_sessions
  WHERE id='a3000000-0000-0000-0000-000000000001';
  IF revoked IS NULL THEN RAISE EXCEPTION 'session revocation metadata was not persisted'; END IF;
END $$;

ROLLBACK;
SELECT 'DPM-Assure authentication session contract: PASS' AS result;
