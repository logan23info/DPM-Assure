import { clearSessionCookie, createCookieSessionResolver } from "@/auth/cookie-session";
import { revokeSession } from "@/auth/session-store";
import { requireAuthenticatedPrincipal } from "@/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const resolver = createCookieSessionResolver(request);
  const principal = await requireAuthenticatedPrincipal(resolver).catch(() => null);

  if (principal) {
    await revokeSession(principal.sessionId, principal.userId);
  }

  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": clearSessionCookie(),
      "Cache-Control": "no-store",
    },
  });
}
