import { z } from "zod";

const csv = z
  .string()
  .default("")
  .transform((s) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  );

const bool = z
  .string()
  .default("false")
  .transform((s) => ["1", "true", "yes"].includes(s.toLowerCase()));

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1),
  AETHEX_API_KEY: z.string().min(1),
  AETHEX_BASE_URL: z.string().url().default("https://api.aethexai.com/api/v1"),
  AETHEX_WEBHOOK_SECRET: z.string().default(""),
  CONFAM_TOOL_KEY: z.string().min(24),
  CONFAM_LINE_NUMBER: z.string().regex(/^\+[1-9]\d{7,14}$/),
  PUBLIC_BRAIN_URL: z.string().url().optional(),
  PHONE_PEPPER: z.string().min(1),
  PHONE_ENC_KEY: z.string().min(1),
  DEMO_MODE: bool,
  DEMO_TEAM_PHONES: csv,
  ELECTION_TZ: z.string().default("Africa/Lagos"),
  /** JSON map written by provision-aethex: {"hotline":"<uuid>","verifier":"…","alert":"…","official":"…"} */
  AETHEX_AGENT_IDS: z
    .string()
    .default("{}")
    .transform((s, ctx) => {
      try {
        return z
          .object({ hotline: z.string().optional(), verifier: z.string().optional(), alert: z.string().optional(), official: z.string().optional() })
          .parse(JSON.parse(s));
      } catch {
        ctx.addIssue({ code: "custom", message: "AETHEX_AGENT_IDS must be JSON" });
        return z.NEVER;
      }
    }),
  RUN_WORKERS: bool.default(true),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`invalid configuration: ${issues}`);
  }
  return parsed.data;
}
