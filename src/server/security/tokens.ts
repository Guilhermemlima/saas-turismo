import "server-only";

import { createHash, randomBytes } from "node:crypto";

/** 256-bit random token, URL-safe. Only its hash is stored. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Rejects obviously malformed tokens before touching the database. */
export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
