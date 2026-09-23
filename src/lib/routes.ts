/** Paths reachable without a session. Everything else requires login. */
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/setup", "/api/health"];
const PUBLIC_PREFIXES = ["/auth/", "/proposal/", "/api/webhooks/"];

export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

/** Only allows internal redirects (prevents open-redirect via ?next=). */
export function safeNextPath(next: unknown, fallback = "/dashboard"): string {
  if (typeof next !== "string") return fallback;
  // Browsers treat "\" like "/", so any backslash or control character is rejected outright.
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
