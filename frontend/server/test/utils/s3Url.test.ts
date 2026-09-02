import { describe, it, expect } from "vitest";
import { extractS3Key } from "../../utils/s3Url";

/**
 * `cdpi-pass-qr-codes` previously allowed anonymous s3:GetObject on every key,
 * exposing 333 QR ticket credentials and certificate PDFs containing attendee
 * names. Verified before the fix: an anonymous GET of a real QR object
 * returned HTTP 200 with a 5267-byte PNG, and a certificate PDF returned 200
 * with 83179 bytes.
 *
 * The bucket is now private except `events/`, so stored URLs must be presigned
 * per request. Getting the key wrong yields SignatureDoesNotMatch, which would
 * silently break the certificates page, hence these tests.
 */
describe("extractS3Key", () => {
  it("extracts the key from a virtual-hosted URL", () => {
    expect(
      extractS3Key(
        "https://cdpi-pass-qr-codes.s3.sa-east-1.amazonaws.com/qr-codes/abc-123.png",
      ),
    ).toBe("qr-codes/abc-123.png");
  });

  it("extracts nested certificate keys", () => {
    expect(
      extractS3Key(
        "https://cdpi-pass-qr-codes.s3.sa-east-1.amazonaws.com/certificates/event_b28e2246/user_34cf4ed0_certificado.pdf",
      ),
    ).toBe("certificates/event_b28e2246/user_34cf4ed0_certificado.pdf");
  });

  it("decodes percent-encoded keys", () => {
    // Real objects in this bucket include spaces and accents, e.g.
    // "DERIVAÇÃO CDPI PASS.jpg". Signing the encoded form yields
    // SignatureDoesNotMatch.
    expect(
      extractS3Key(
        "https://cdpi-pass-qr-codes.s3.sa-east-1.amazonaws.com/DERIVA%C3%87%C3%83O%20CDPI%20PASS.jpg",
      ),
    ).toBe("DERIVAÇÃO CDPI PASS.jpg");
  });

  it("handles path-style URLs", () => {
    expect(
      extractS3Key(
        "https://s3.sa-east-1.amazonaws.com/cdpi-pass-qr-codes/qr-codes/abc.png",
      ),
    ).toBe("qr-codes/abc.png");
  });

  it("handles the global endpoint without a region", () => {
    expect(
      extractS3Key("https://cdpi-pass-qr-codes.s3.amazonaws.com/qr-codes/x.png"),
    ).toBe("qr-codes/x.png");
  });

  it("returns null for malformed or empty input", () => {
    expect(extractS3Key("not-a-url")).toBeNull();
    expect(
      extractS3Key("https://cdpi-pass-qr-codes.s3.sa-east-1.amazonaws.com/"),
    ).toBeNull();
  });
});
