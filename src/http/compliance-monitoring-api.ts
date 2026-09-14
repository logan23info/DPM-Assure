import "server-only";

import { randomUUID } from "node:crypto";

import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import {
  AuthenticationRequiredError,
  requireAuthenticatedPrincipal,
  type SessionResolver,
} from "@/auth/session";
import { AuthorizationDeniedError, permissions } from "@/auth/rbac";
import {
  acknowledgeComplianceAlert,
  assessSourceChangeImpact,
  listComplianceAlerts,
  listSourceChangeImpacts,
  refreshComplianceAlerts,
  resolveComplianceAlert,
  resolveSourceChangeImpact,
} from "@/domain/compliance/monitoring-service";

export type MonitoringCommand =
  | { action: "refresh"; asOf?: string | undefined }
  | { action: "acknowledge_alert"; alertId: string }
  | { action: "resolve_alert"; alertId: string }
  | { action: "assess_source_impact"; impactId: string; rationale: string }
  | { action: "resolve_source_impact"; impactId: string; rationale: string };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function parseUuid(value: string, field: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${field} must be a UUID`);
  }
  return value;
}

function mapError(error: unknown): Response {
  if (error instanceof AuthenticationRequiredError) {
    return json({ error: "AUTHENTICATION_REQUIRED" }, 401);
  }
  if (error instanceof AuthorizationDeniedError) {
    return json({ error: "AUTHORIZATION_DENIED" }, 403);
  }
  if (error instanceof Error) {
    return json({ error: "INVALID_REQUEST", message: error.message }, 400);
  }
  return json({ error: "INTERNAL_ERROR" }, 500);
}

async function parseCommand(request: Request): Promise<MonitoringCommand> {
  const body = await request.json() as Record<string, unknown>;
  if (typeof body.action !== "string") throw new Error("action is required");

  switch (body.action) {
    case "refresh":
      if (body.asOf !== undefined && typeof body.asOf !== "string") throw new Error("asOf must be an ISO timestamp");
      return { action: "refresh", asOf: body.asOf as string | undefined };
    case "acknowledge_alert":
    case "resolve_alert":
      if (typeof body.alertId !== "string") throw new Error("alertId is required");
      return { action: body.action, alertId: parseUuid(body.alertId, "alertId") };
    case "assess_source_impact":
    case "resolve_source_impact":
      if (typeof body.impactId !== "string") throw new Error("impactId is required");
      if (typeof body.rationale !== "string" || body.rationale.trim().length < 5) throw new Error("rationale is required");
      return {
        action: body.action,
        impactId: parseUuid(body.impactId, "impactId"),
        rationale: body.rationale.trim(),
      };
    default:
      throw new Error("Unsupported monitoring action");
  }
}

export function createComplianceMonitoringApi(resolver: SessionResolver) {
  return {
    async get(organizationId: string): Promise<Response> {
      try {
        parseUuid(organizationId, "organizationId");
        const principal = await requireAuthenticatedPrincipal(resolver);
        const requestId = randomUUID();

        return withAuthorizedTenantTransaction(
          { principal, organizationId, requestId, permission: permissions.complianceRead },
          async (transaction) => json({
            alerts: await listComplianceAlerts(transaction),
            sourceChangeImpacts: await listSourceChangeImpacts(transaction),
          }),
        );
      } catch (error) {
        return mapError(error);
      }
    },

    async post(organizationId: string, request: Request): Promise<Response> {
      try {
        parseUuid(organizationId, "organizationId");
        const principal = await requireAuthenticatedPrincipal(resolver);
        const command = await parseCommand(request);
        const requestId = randomUUID();

        return withAuthorizedTenantTransaction(
          { principal, organizationId, requestId, permission: permissions.complianceMonitoringManage },
          async (transaction) => {
            switch (command.action) {
              case "refresh": {
                const asOf = command.asOf ? new Date(command.asOf) : new Date();
                if (Number.isNaN(asOf.getTime())) throw new Error("asOf must be a valid ISO timestamp");
                await refreshComplianceAlerts(transaction, asOf);
                return json({ ok: true });
              }
              case "acknowledge_alert":
                return json(await acknowledgeComplianceAlert(transaction, command.alertId));
              case "resolve_alert":
                return json(await resolveComplianceAlert(transaction, command.alertId));
              case "assess_source_impact":
                return json(await assessSourceChangeImpact(transaction, command.impactId, command.rationale));
              case "resolve_source_impact":
                return json(await resolveSourceChangeImpact(transaction, command.impactId, command.rationale));
            }
          },
        );
      } catch (error) {
        return mapError(error);
      }
    },
  };
}
