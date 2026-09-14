const base = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, init = {}) {
  return fetch(`${base}${path}`, { redirect: "manual", ...init });
}

const health = await request("/api/health");
check(health.status === 200, `health expected 200, got ${health.status}`);
const healthBody = await health.json();
check(healthBody.status === "ok", "health payload must report ok");

const login = await request("/login");
check(login.status === 200, `login expected 200, got ${login.status}`);
for (const [header, expected] of [
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
  ["cross-origin-opener-policy", "same-origin"],
  ["cross-origin-resource-policy", "same-origin"],
]) {
  check(login.headers.get(header) === expected, `${header} security header missing or invalid`);
}
check((login.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'none'"), "CSP must deny framing");
check(login.headers.get("x-powered-by") === null, "framework powered-by header must be disabled");

const dashboard = await request("/dashboard");
check([302, 303, 307, 308].includes(dashboard.status), `anonymous dashboard expected redirect, got ${dashboard.status}`);
check((dashboard.headers.get("location") ?? "").includes("/login"), "anonymous dashboard must redirect to login");

const crossSite = await request("/api/auth/logout", {
  method: "POST",
  headers: {
    origin: "https://attacker.invalid",
    "sec-fetch-site": "cross-site",
  },
});
check(crossSite.status === 403, `cross-site mutation expected 403, got ${crossSite.status}`);
const crossSiteBody = await crossSite.json();
check(crossSiteBody.error === "CROSS_SITE_MUTATION_REJECTED", "cross-site mutation must fail closed");

console.log("Release smoke contract passed");
