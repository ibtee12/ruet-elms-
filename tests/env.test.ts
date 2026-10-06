import { validateEnv } from "../lib/env";

describe("Environment Validation", () => {
  const validEnv = {
    DATABASE_URL:
      "postgresql://postgres:postgres@localhost:5432/ruet_elms?schema=public",
    NEXTAUTH_SECRET: "development-secret-ruet-elms-min-32-chars-long",
    NEXTAUTH_URL: "http://localhost:3000",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "dummy-service-role-key",
    SUPABASE_BUCKET: "elms-private",
    RESEND_API_KEY: "re_123456789",
    EMAIL_FROM: "RUET ELMS <noreply@ruet.ac.bd>",
    CRON_SECRET: "dummy-cron-secret",
    APP_TIMEZONE: "Asia/Dhaka",
    NODE_ENV: "test",
  };

  it("successfully parses valid environment variables", () => {
    const parsed = validateEnv(validEnv);
    expect(parsed.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(parsed.APP_TIMEZONE).toBe("Asia/Dhaka");
  });

  it("throws a clear error when a required environment variable is missing", () => {
    const invalidEnv = { ...validEnv, DATABASE_URL: "" };
    expect(() => validateEnv(invalidEnv)).toThrow(/DATABASE_URL is required/);
  });

  it("throws a clear error when NEXTAUTH_URL is invalid", () => {
    const invalidEnv = { ...validEnv, NEXTAUTH_URL: "not-a-url" };
    expect(() => validateEnv(invalidEnv)).toThrow(
      /NEXTAUTH_URL must be a valid URL/
    );
  });

  it("fails when multiple required variables are missing", () => {
    const emptyEnv = {};
    expect(() => validateEnv(emptyEnv)).toThrow(
      /Missing or invalid environment variables/
    );
  });
});
