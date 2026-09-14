import { getEmailSender } from "@/email/resend";
import { issueLoginToken } from "@/auth/session-store";

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

  // Always return the same response for existing and unknown users.
  return Response.json(
    { ok: true, message: "If the account exists, a sign-in link has been sent." },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
