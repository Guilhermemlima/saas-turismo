import { getPublicEnv } from "./env";

/** Public URL of an object in a public bucket (agency logos). */
export function publicStorageUrl(bucket: string, path: string | null | undefined): string | null {
  const env = getPublicEnv();
  if (!env || !path) return null;
  return `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Detects PNG / JPEG / WebP from magic bytes (the browser-provided MIME type is not trusted). */
export function detectImageType(bytes: Uint8Array): "png" | "jpeg" | "webp" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}
