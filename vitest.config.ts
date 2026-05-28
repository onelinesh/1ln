import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrationsPath = path.join(__dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // Expose migrations as a test-only binding for the setup file.
          // SCRIPT_HMAC_SECRET is bound here so the tamper-detection helpers
          // have a deterministic, non-empty key under test (never used in prod).
          bindings: {
            TEST_MIGRATIONS: migrations,
            SCRIPT_HMAC_SECRET: "test-hmac-secret-do-not-use-in-prod",
            GITHUB_OAUTH_CLIENT_ID: "test-client-id",
            GITHUB_OAUTH_CLIENT_SECRET: "test-client-secret",
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
