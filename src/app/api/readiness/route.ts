import { validateRuntimeEnvironment } from "@/config/runtime-env";
import { getPool } from "@/db/runtime";
import { operationalLog } from "@/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    validateRuntimeEnvironment(process.env);
    await getPool().query("select 1 as ready");

    return Response.json(
      {
        service: "dpm-assure",
        status: "ready",
        checks: { configuration: "ok", database: "ok" },
        requestId,
        durationMs: Date.now() - startedAt,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    operationalLog("error", "readiness.failed", {
      requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
      durationMs: Date.now() - startedAt,
    });

    return Response.json(
      {
        service: "dpm-assure",
        status: "not_ready",
        requestId,
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
