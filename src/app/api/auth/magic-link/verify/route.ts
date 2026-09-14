import { consumeLoginTokenAndCreateSession } from "@/auth/session-store";
import { sessionCookie } from "@/auth/cookie-session";

export const runtime = "nodejs";

function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || null;
}

function requireBaseUrl(): string {
  const value = process.env.APP_BASE_URL?.trim();
  if (!value) throw new Error("APP_BASE_URL is required");
  return value.replace(/\/$/, "");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  if (token.length < 32 || token.length > 512) {
    return Response.json({ error: "INVALID_OR_EXPIRED_LINK" }, { status: 400 });
  }

  try {
    const session = await consumeLoginTokenAndCreateSession(token, {
      ip: getClientIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    return new Response(null, {
      status: 303,
      headers: {
        Location: `${requireBaseUrl()}/`,
        "Set-Cookie": sessionCookie(session.token, session.expiresAt),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { error: "INVALID_OR_EXPIRED_LINK" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
