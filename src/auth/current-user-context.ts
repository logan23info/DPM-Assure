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

export async function getCurrentUserContext(): Promise<CurrentUserContext | null> {
  const cookieStore = await cookies();
  const principal = await resolveSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!principal) return null;

  const memberships = await getPool().query<{
    organization_id: string;
    organization_name: string;
    organization_slug: string;
    role: MembershipRole;
  }>(
    `select m.organization_id,
            o.name as organization_name,
            o.slug as organization_slug,
            m.role
       from memberships m
       join organizations o on o.id = m.organization_id
      where m.user_id = $1
        and m.status = 'ACTIVE'
        and o.status = 'ACTIVE'
      order by o.name asc`,
    [principal.userId],
  );

  return {
    principal,
    memberships: memberships.rows.map((row) => ({
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      organizationSlug: row.organization_slug,
      role: row.role,
    })),
  };
}
