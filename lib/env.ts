import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  SUPABASE_BUCKET: z.string().min(1, "SUPABASE_BUCKET is required"),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
  EMAIL_FROM: z.string().min(1, "EMAIL_FROM is required"),
  CRON_SECRET: z.string().min(1, "CRON_SECRET is required"),
  APP_TIMEZONE: z.string().default("Asia/Dhaka"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(
  runtimeEnv: Record<string, string | undefined> = process.env
): Env {
  if (process.env.SKIP_ENV_VALIDATION === "true") {
    return runtimeEnv as unknown as Env;
  }

  const parsed = envSchema.safeParse(runtimeEnv);

  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map(
        (issue) => `  - ${issue.path.join(".") || "variable"}: ${issue.message}`
      )
      .join("\n");

    const message = `\n❌ Missing or invalid environment variables:\n${errorDetails}\n\nPlease check your .env file against .env.example.\n`;
    console.error(message);
    throw new Error(message);
  }

  return parsed.data;
}

export const env = validateEnv();
