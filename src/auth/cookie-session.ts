import "server-only";

import { createHash } from "node:crypto";

import { getPool } from "@/db/runtime";
import type { AuthenticatedPrincipal, SessionResolver } from "./session";

export const SESSION_COOKIE_NAME = "dpm_session";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key !== name) continue;
    const value = part.slice(index + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function sessionCookie(value: string, expiresAt: Date): string {
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ].join("; ");
}

export function clearSessionCookie(): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}

export async function resolveSessionToken(rawToken: string | null | undefined): Promise<AuthenticatedPrincipal | null> {
  if (!rawToken || rawToken.length < 32 || rawToken.length > 512) return null;

  const tokenHash = sha256(rawToken);
  const result = await getPool().query<{
    session_id: string;
    user_id: string;
    email: string;
    issued_at: Date;
    expires_at: Date;
  }>(
    "select session_id, user_id, email, issued_at, expires_at from auth_resolve_session($1::char(64))",
    [tokenHash],
  );

  const row = result.rows[0];
  if (!row) return null;

  void getPool().query(
    "update auth_sessions set last_seen_at = now() where id = $1 and revoked_at is null",
    [row.session_id],
  ).catch(() => undefined);

  return {
    userId: row.user_id,
    sessionId: row.session_id,
    email: row.email,
    issuedAt: new Date(row.issued_at),
    expiresAt: new Date(row.expires_at),
  };
}

export class CookieSessionResolver implements SessionResolver {
  constructor(private readonly request: Request) {}

  async resolve(): Promise<AuthenticatedPrincipal | null> {
    return resolveSessionToken(parseCookie(this.request.headers.get("cookie"), SESSION_COOKIE_NAME));
  }
}

export function createCookieSessionResolver(request: Request): SessionResolver {
  return new CookieSessionResolver(request);
}
