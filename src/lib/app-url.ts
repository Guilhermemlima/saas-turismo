/**
 * Public base URL of the app, used in auth e-mail links.
 * On Vercel the platform-provided domain wins over a localhost value copied from .env.example,
 * so confirmation links never point to a developer machine in production.
 */
export function resolveAppUrl(env: Record<string, string | undefined>): string {
  const explicit = env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  const onVercel = Boolean(env.VERCEL_ENV);
  const isLocal = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url);

  if (explicit && !(onVercel && isLocal(explicit))) return explicit;

  if (env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function getAppUrl(): string {
  return resolveAppUrl({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  });
}
