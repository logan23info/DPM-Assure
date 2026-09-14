import "server-only";

import { and, eq } from "drizzle-orm";

import { memberships } from "@/db/schema";
import type { AppDatabase } from "@/db/runtime";

import type { MembershipRole } from "./rbac";

export interface ActiveMembership {
  readonly organizationId: string;
  readonly userId: string;
  readonly role: MembershipRole;
}

export class MembershipRequiredError extends Error {
  constructor() {
    super("An active organization membership is required");
    this.name = "MembershipRequiredError";
  }
}

export async function requireActiveMembership(
  db: AppDatabase,
  userId: string,
  organizationId: string,
): Promise<ActiveMembership> {
  const [membership] = await db
    .select({
      organizationId: memberships.organizationId,
      userId: memberships.userId,
      role: memberships.role,
    })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.userId, userId),
        eq(memberships.status, "ACTIVE"),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new MembershipRequiredError();
  }

  return membership;
}
