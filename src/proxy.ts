import { NextResponse, type NextRequest } from "next/server";

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function allowedMutationOrigins(request: NextRequest) {
  const origins = new Set([request.nextUrl.origin]);
  const configured = process.env.APP_BASE_URL;

  if (configured) {
    try {
      origins.add(new URL(configured).origin);
    } catch {
      // Invalid deployment configuration must not broaden the origin allowlist.
    }
  }

  return origins;
}

export function proxy(request: NextRequest) {
  if (!mutationMethods.has(request.method)) return NextResponse.next();

  const origin = request.headers.get("origin");
  const secFetchSite = request.headers.get("sec-fetch-site");

  if (origin) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
    }

    if (!allowedMutationOrigins(request).has(parsed.origin)) {
      return NextResponse.json({ error: "CROSS_SITE_MUTATION_REJECTED" }, { status: 403 });
    }
  } else if (secFetchSite && !["same-origin", "same-site", "none"].includes(secFetchSite)) {
    return NextResponse.json({ error: "CROSS_SITE_MUTATION_REJECTED" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
