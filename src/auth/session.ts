import "server-only";

export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly sessionId: string;
  readonly email?: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export interface SessionResolver {
  resolve(): Promise<AuthenticatedPrincipal | null>;
}

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication is required");
    this.name = "AuthenticationRequiredError";
  }
}

export async function requireAuthenticatedPrincipal(
  resolver: SessionResolver,
): Promise<AuthenticatedPrincipal> {
  const principal = await resolver.resolve();

  if (!principal || principal.expiresAt.getTime() <= Date.now()) {
    throw new AuthenticationRequiredError();
  }

  return principal;
}
