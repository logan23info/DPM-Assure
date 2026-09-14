import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { getPool } from "@/db/runtime";

const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_REQUESTS_PER_WINDOW = 5;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function opaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface LoginTokenIssue {
  readonly token: string;
  readonly expiresAt: Date;
  readonly email: string;
}

export interface SessionIssue {
  readonly token: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly expiresAt: Date;
}

export async function issueLoginToken(
  email: string,
  metadata: { ip?: string | null; userAgent?: string | null } = {},
): Promise<LoginTokenIssue | null> {
  const normalized = email.trim().toLowerCase();
  const windowStart = new Date(Date.now() - LOGIN_WINDOW_MS);

  const rate = await getPool().query<{ request_count: string }>(
    `select count(*)::text as request_count
       from auth_login_tokens
      where requested_at >= $1
        and (lower(email)=lower($2) or ($3::inet is not null and requested_ip=$3::inet))`,
    [windowStart, normalized, metadata.ip ?? null],
  );
  if (Number(rate.rows[0]?.request_count ?? "0") >= MAX_LOGIN_REQUESTS_PER_WINDOW) return null;

  const user = await getPool().query<{ email: string }>(
    "select email from users where lower(email)=lower($1) and status='ACTIVE' limit 1",
    [normalized],
  );

  // Do not reveal account existence to callers.
  if (!user.rows[0]) return null;

  const token = opaqueToken();
  const expiresAt = new Date(Date.now() + LOGIN_TOKEN_TTL_MS);
  await getPool().query(
    `insert into auth_login_tokens(email,token_hash,expires_at,requested_ip,requested_user_agent)
     values ($1,$2,$3,$4,$5)`,
    [normalized, sha256(token), expiresAt, metadata.ip ?? null, metadata.userAgent ?? null],
  );
  return { token, expiresAt, email: normalized };
}

export async function consumeLoginTokenAndCreateSession(
  token: string,
  metadata: { ip?: string | null; userAgent?: string | null } = {},
): Promise<SessionIssue> {
  if (token.length < 32 || token.length > 512) throw new Error("Invalid login token");

  const client = await getPool().connect();
  try {
    await client.query("begin");
    const consumed = await client.query<{ email: string }>(
      "select consume_login_token($1::char(64), now()) as email",
      [sha256(token)],
    );
    const email = consumed.rows[0]?.email;
    if (!email) throw new Error("Invalid login token");

    const user = await client.query<{ id: string }>(
      "select id from users where lower(email)=lower($1) and status='ACTIVE' limit 1",
      [email],
    );
    const userId = user.rows[0]?.id;
    if (!userId) throw new Error("Authenticated user is inactive or missing");

    const sessionToken = opaqueToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const inserted = await client.query<{ id: string }>(
      `insert into auth_sessions(user_id,token_hash,expires_at,created_ip,created_user_agent)
       values ($1,$2,$3,$4,$5) returning id`,
      [userId, sha256(sessionToken), expiresAt, metadata.ip ?? null, metadata.userAgent ?? null],
    );
    const sessionId = inserted.rows[0]?.id;
    if (!sessionId) throw new Error("Session creation failed");

    await client.query("commit");
    return { token: sessionToken, sessionId, userId, expiresAt };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeSession(sessionId: string, userId: string): Promise<void> {
  await getPool().query(
    `update auth_sessions
        set revoked_at = coalesce(revoked_at, now())
      where id=$1 and user_id=$2`,
    [sessionId, userId],
  );
}
