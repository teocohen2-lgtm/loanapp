import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  // Render injects PORT automatically (10000 by default)
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  JWT_EXPIRES_IN: z.string().default("1h"),
  ENCRYPTION_KEY: z
    .string()
    .min(32, "ENCRYPTION_KEY must be at least 32 characters"),
  ALLOW_MOCK_SMS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  KYC_UPLOADS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  KYC_STORAGE_PERSISTENT: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  UPLOAD_DIR: z.string().default("./uploads"),

  // "semaphore" sends real SMS through https://semaphore.co (Philippine gateway).
  SMS_PROVIDER: z.enum(["mock", "semaphore"]).default("mock"),
  SEMAPHORE_API_KEY: z.string().optional(),
  SEMAPHORE_SENDER_NAME: z.string().optional(),

  // "db" keeps KYC photos in PostgreSQL: use it where there is no persistent disk.
  STORAGE_DRIVER: z.enum(["disk", "db"]).default("disk"),

  // Lets the demo loan module run with NODE_ENV=production (test deployments only).
  DEMO_LOANS_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Serve the built frontend (../frontend/dist) from this server: one deployment, no CORS.
  SERVE_FRONTEND: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(
    parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n")
  );
  process.exit(1);
}

// if (
//   parsed.data.NODE_ENV === "production" &&
//   parsed.data.KYC_UPLOADS_ENABLED &&
//   (!parsed.data.KYC_STORAGE_PERSISTENT ||
//     !parsed.data.UPLOAD_DIR.startsWith("/"))
// ) {
//   console.error(
//     "Production KYC requires persistent storage and an absolute UPLOAD_DIR; otherwise disable KYC_UPLOADS_ENABLED."
//   );
//   process.exit(1);
// }

if (
  parsed.data.SMS_PROVIDER === "semaphore" &&
  !parsed.data.SEMAPHORE_API_KEY
) {
  console.error("SMS_PROVIDER=semaphore requires SEMAPHORE_API_KEY.");
  process.exit(1);
}

if (
  parsed.data.NODE_ENV === "production" &&
  parsed.data.KYC_UPLOADS_ENABLED &&
  parsed.data.STORAGE_DRIVER === "disk" &&
  (!parsed.data.KYC_STORAGE_PERSISTENT ||
    !parsed.data.UPLOAD_DIR.startsWith("/"))
) {
  console.error(
    "Production KYC requires persistent storage and an absolute UPLOAD_DIR; otherwise disable KYC_UPLOADS_ENABLED."
  );
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === "production",
  // "https://a.com, https://b.com" -> ["https://a.com", "https://b.com"]
  corsOrigins: parsed.data.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean),
};
