import { getEmailSender } from "@/email/resend";
import { issueLoginToken } from "@/auth/session-store";
import { consumeRateLimit } from "@/security/rate-limit";

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

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const email = typeof body === "object" && body !== null && "email" in body
    ? String((body as { email: unknown }).email).trim().toLowerCase()
    : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const ip = getClientIp(request) ?? "unknown";
  const [emailAllowed, ipAllowed] = await Promise.all([
    consumeRateLimit({ namespace: "magic-link-email", identifier: email, maxRequests: 5, windowSeconds: 900 }),
    consumeRateLimit({ namespace: "magic-link-ip", identifier: ip, maxRequests: 20, windowSeconds: 900 }),
  ]);

  if (emailAllowed && ipAllowed) {
    const issue = await issueLoginToken(email, {
      ip: getClientIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    if (issue) {
      const signInUrl = new URL("/api/auth/magic-link/verify", requireBaseUrl());
      signInUrl.searchParams.set("token", issue.token);
      await getEmailSender().sendSignInEmail({
        to: issue.email,
        signInUrl: signInUrl.toString(),
        expiresAt: issue.expiresAt,
      });
    }
  }

  // Existing, unknown, and rate-limited identifiers deliberately receive the same response.
  return Response.json(
    { ok: true, message: "If the account exists, a sign-in link has been sent." },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
