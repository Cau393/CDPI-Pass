import { s3Service } from "../services/s3Service";
import { extractS3Key, isPresigned } from "./s3Url";

/**
 * Turn a stored S3 object URL into a short-lived presigned URL.
 *
 * Certificate PDFs carry the attendee's full name and live in
 * `cdpi-pass-qr-codes`, which used to allow anonymous `s3:GetObject` on every
 * key. Anyone with (or guessing) a URL could read someone else's certificate,
 * and the same policy exposed 333 QR ticket credentials.
 *
 * The bucket is now private except `events/` (public cover images), so stored
 * URLs no longer resolve on their own. The certificates API signs them per
 * request instead. That works cleanly here because the client always fetches
 * the URL fresh from an authenticated endpoint, so a short TTL is invisible.
 *
 * Returns null when signing fails, so one bad row cannot break the whole
 * certificates page.
 */
export async function toPresignedUrl(
  storedUrl: string | null | undefined,
  expiresInSeconds = 900,
): Promise<string | null> {
  if (!storedUrl) return null;

  // Re-signing an already-signed URL would produce an invalid signature.
  if (isPresigned(storedUrl)) return storedUrl;

  try {
    const key = extractS3Key(storedUrl);
    if (!key) return null;
    return await s3Service.getPresignedUrl(key, expiresInSeconds);
  } catch (error) {
    console.error("Failed to presign certificate URL:", error);
    return null;
  }
}

export { extractS3Key } from "./s3Url";
