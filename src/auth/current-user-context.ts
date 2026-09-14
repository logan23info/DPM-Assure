import "server-only";

import { cookies } from "next/headers";

import { getPool } from "@/db/runtime";
import { resolveSessionToken, SESSION_COOKIE_NAME } from "./cookie-session";
import type { AuthenticatedPrincipal } from "./session";
import type { MembershipRole } from "./rbac";

export interface CurrentMembership {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly organizationSlug: string;
  readonly role: MembershipRole;
}

export interface CurrentUserContext {
  readonly principal: AuthenticatedPrincipal;
  readonly memberships: readonly CurrentMembership[];
}

async function discoverMemberships(userId: string): Promise<readonly CurrentMembership[]> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const memberships = await client.query<{
      organization_id: string;
      organization_name: string;
      organization_slug: string;
      role: MembershipRole;
    }>("select organization_id, organization_name, organization_slug, role from auth_current_user_memberships()");
    await client.query("commit");
    return memberships.rows.map((row) => ({
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      organizationSlug: row.organization_slug,
      role: row.role,
    }));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function getCurrentUserContext(): Promise<CurrentUserContext | null> {
  const cookieStore = await cookies();
  const principal = await resolveSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!principal) return null;

  return {
    principal,
    memberships: await discoverMemberships(principal.userId),
  };
}
