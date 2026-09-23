import "server-only";

import { z } from "zod";

/**
 * Server-only secrets. They are optional at build time so the app can boot before each
 * integration is configured; features that need them call `requireServerEnv`.
 */
const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  CRON_SECRET: z.string().min(32, "CRON_SECRET precisa de ao menos 32 caracteres.").optional(),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
    CRON_SECRET: process.env.CRON_SECRET || undefined,
  });
  return parsed.success ? parsed.data : {};
}

export function requireServerEnv<K extends keyof ServerEnv>(key: K): NonNullable<ServerEnv[K]> {
  const value = getServerEnv()[key];
  if (!value) throw new Error(`${key} não está configurado no servidor. Veja ENVIRONMENT.md.`);
  return value as NonNullable<ServerEnv[K]>;
}

export function isJobsConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.SUPABASE_SERVICE_ROLE_KEY && env.CRON_SECRET);
}
