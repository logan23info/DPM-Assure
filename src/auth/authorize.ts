import "server-only";

import type { AuthenticatedPrincipal } from "./session";
import { requireActiveMembership, type ActiveMembership } from "./organization-context";
import { requirePermission, type Permission } from "./rbac";
import {
  withTenantTransaction,
  type TenantTransaction,
} from "@/db/tenant-transaction";

export interface AuthorizedTenantTransaction extends TenantTransaction {
  readonly principal: AuthenticatedPrincipal;
  readonly membership: ActiveMembership;
}

export interface AuthorizationRequest {
  readonly principal: AuthenticatedPrincipal;
  readonly organizationId: string;
  readonly requestId: string;
  readonly permission: Permission;
}

export async function withAuthorizedTenantTransaction<T>(
  request: AuthorizationRequest,
  work: (transaction: AuthorizedTenantTransaction) => Promise<T>,
): Promise<T> {
  return withTenantTransaction(
    {
      userId: request.principal.userId,
      organizationId: request.organizationId,
      requestId: request.requestId,
    },
    async (transaction) => {
      const membership = await requireActiveMembership(
        transaction.db,
        request.principal.userId,
        request.organizationId,
      );

      requirePermission(membership.role, request.permission);

      return work({
        ...transaction,
        principal: request.principal,
        membership,
      });
    },
  );
}
