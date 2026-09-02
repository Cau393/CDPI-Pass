/**
 * Extract the object key from an S3 URL.
 *
 * Deliberately free of AWS-SDK imports: `s3Service` builds a client and throws
 * at construction when AWS env vars are missing, so importing it here would
 * make this pure helper untestable and would drag credentials into unrelated
 * code paths.
 *
 * Keys in `cdpi-pass-qr-codes` contain spaces and accented characters (event
 * banners were uploaded under their original filenames), so the path arrives
 * percent-encoded and must be decoded. Signing the encoded form makes S3
 * return SignatureDoesNotMatch.
 *
 * Handles both URL layouts:
 *   virtual-host: https://<bucket>.s3.<region>.amazonaws.com/<key>
 *   path-style:   https://s3.<region>.amazonaws.com/<bucket>/<key>
 */
export function extractS3Key(url: string): string | null {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/+/, "");
    if (!path) return null;

    const isPathStyle = /^s3[.-]/.test(parsed.hostname);
    const raw = isPathStyle ? path.split("/").slice(1).join("/") : path;
    if (!raw) return null;

    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** True when a URL already carries SigV4 query parameters. */
export function isPresigned(url: string): boolean {
  return url.includes("X-Amz-Signature=");
}
