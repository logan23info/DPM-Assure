import { expect, test, type BrowserContext } from "@playwright/test";

const ORG_ADMIN = "f1000000-0000-4000-8000-000000000001";
const ORG_OTHER = "f1000000-0000-4000-8000-000000000002";
const ORG_CLIENT = "f1000000-0000-4000-8000-000000000003";
const ADMIN_SESSION = "e2e-admin-session-token-abcdefghijklmnopqrstuvwxyz1234567890";
const CLIENT_SESSION = "e2e-client-session-token-abcdefghijklmnopqrstuvwxyz1234567890";
const MAGIC_TOKEN = "e2e-magic-link-token-abcdefghijklmnopqrstuvwxyz1234567890";
const BASE_URL = "http://127.0.0.1:3000";

async function setSession(context: BrowserContext, value: string) {
  await context.addCookies([
    {
      name: "dpm_session",
      value,
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

test("anonymous users are redirected to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: /passwordless sign-in/i })).toBeVisible();
});

test("magic link is single-use and creates a server session", async ({ request }) => {
  const first = await request.get(`/api/auth/magic-link/verify?token=${encodeURIComponent(MAGIC_TOKEN)}`, {
    maxRedirects: 0,
  });
  expect(first.status()).toBe(303);
  expect(first.headers()["set-cookie"] ?? "").toContain("dpm_session=");
  expect(first.headers()["cache-control"]).toBe("no-store");

  const replay = await request.get(`/api/auth/magic-link/verify?token=${encodeURIComponent(MAGIC_TOKEN)}`, {
    maxRedirects: 0,
  });
  expect(replay.status()).toBe(400);
  await expect(replay.json()).resolves.toMatchObject({ error: "INVALID_OR_EXPIRED_LINK" });
});

test("ORG_ADMIN resolves only its memberships under non-owner RLS", async ({ context, page }) => {
  await setSession(context, ADMIN_SESSION);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Assurance workspace" })).toBeVisible();
  await expect(page.getByText("E2E Admin Organization")).toBeVisible();
  await expect(page.getByText("E2E Other Organization")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open assurance engagements" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage members" })).toBeVisible();

  const denied = await page.goto(`/organizations/${ORG_OTHER}/members`);
  expect(denied?.status()).toBe(404);
  await expect(page.getByText("E2E Other Organization")).toHaveCount(0);

  await page.goto(`/organizations/${ORG_ADMIN}/members`);
  await expect(page).toHaveURL(new RegExp(`/organizations/${ORG_ADMIN}/members$`));
});

test("CLIENT sees only restricted client workflow entry points", async ({ context, page }) => {
  await setSession(context, CLIENT_SESSION);
  await page.goto("/dashboard");
  await expect(page.getByText("E2E Client Organization")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open client evidence requests" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open assurance engagements" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "AI assistance" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Manage members" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Client portal access" })).toHaveCount(0);

  await page.goto(`/organizations/${ORG_CLIENT}/client-portal`);
  await expect(page).toHaveURL(new RegExp(`/organizations/${ORG_CLIENT}/client-portal$`));
});

test("logout revokes the active server session", async ({ context, page, request }) => {
  await setSession(context, ADMIN_SESSION);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Assurance workspace" })).toBeVisible();

  const status = await page.evaluate(async () => {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      redirect: "manual",
    });
    return response.status;
  });
  expect(status).toBe(204);

  // Reuse the original raw token explicitly. If logout revoked the server session,
  // it must no longer authenticate even though the request still presents it.
  const dashboard = await request.get("/dashboard", {
    headers: { cookie: `dpm_session=${ADMIN_SESSION}` },
    maxRedirects: 0,
  });
  expect([302, 303, 307, 308]).toContain(dashboard.status());
  expect(dashboard.headers()["location"] ?? "").toContain("/login");
});

test("browser security policy blocks cross-site mutations", async ({ request }) => {
  const response = await request.post("/api/auth/logout", {
    headers: {
      origin: "https://attacker.invalid",
      "sec-fetch-site": "cross-site",
    },
  });
  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({ error: "CROSS_SITE_MUTATION_REJECTED" });
});
