export const runtime = "nodejs";

export function GET() {
  return Response.json({
    service: "dpm-assure",
    status: "ok",
  });
}
