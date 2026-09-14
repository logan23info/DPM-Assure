-- DPM-Assure server-side authentication sessions.
-- Session tokens are never stored in plaintext; only SHA-256 token hashes are persisted.

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_ip inet,
  created_user_agent text,
  CHECK (expires_at > issued_at),
  CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);
CREATE INDEX auth_sessions_user_expiry_idx ON auth_sessions(user_id, expires_at DESC);
CREATE INDEX auth_sessions_active_lookup_idx ON auth_sessions(token_hash, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE auth_login_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  requested_ip inet,
  requested_user_agent text,
  CHECK (expires_at > requested_at),
  CHECK (consumed_at IS NULL OR consumed_at >= requested_at)
);
CREATE INDEX auth_login_tokens_email_idx ON auth_login_tokens(lower(email), requested_at DESC);
CREATE INDEX auth_login_tokens_active_lookup_idx ON auth_login_tokens(token_hash, expires_at) WHERE consumed_at IS NULL;

-- Authentication tables are server-only infrastructure and intentionally do not use tenant RLS.
-- Runtime access must occur through the trusted server database credential, never browser/client SQL.

CREATE OR REPLACE FUNCTION consume_login_token(p_token_hash char(64), p_now timestamptz)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE token_email text;
BEGIN
  UPDATE auth_login_tokens
  SET consumed_at = p_now
  WHERE token_hash = p_token_hash
    AND consumed_at IS NULL
    AND expires_at > p_now
  RETURNING email INTO token_email;

  IF token_email IS NULL THEN
    RAISE EXCEPTION 'Login token is invalid, expired, or already consumed';
  END IF;
  RETURN token_email;
END;
$$;

COMMENT ON TABLE auth_sessions IS 'Server-side authenticated sessions. Raw bearer/session tokens are never persisted.';
COMMENT ON TABLE auth_login_tokens IS 'Single-use email sign-in tokens; delivery is handled by a provider adapter.';
