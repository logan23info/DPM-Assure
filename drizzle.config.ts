import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: [
    "./src/db/schema.ts",
    "./src/db/governance-schema.ts",
    "./src/db/privacy-schema.ts",
    "./src/db/privacy-alert-schema.ts",
    "./src/db/privacy-assurance-schema.ts",
    "./src/db/obligation-schema.ts",
    "./src/db/compliance-monitoring-schema.ts",
    "./src/db/onboarding-schema.ts",
    "./src/db/storage-schema.ts",
  ],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://postgres:postgres@localhost:5432/dpm_assure",
  },
  strict: true,
  verbose: true,
});
