import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const apiRequest = vi.fn();
vi.mock("@/lib/queryClient", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/queryClient")>();
  return {
    ...actual,
    apiRequest: (...a: Parameters<typeof actual.apiRequest>) => apiRequest(...a),
  };
});

import { CertificatesTab } from "../../components/CertificatesTab";

const CERT_URL = "https://s3.example.com/certificates/e1.pdf?X-Amz-Signature=abc";

beforeEach(() => {
  vi.clearAllMocks();
  apiRequest.mockResolvedValue(
    new Response(
      JSON.stringify({
        data: [
          {
            eventId: "e1",
            eventName: "Workshop Peptídeos",
            eventDate: "2026-10-20T11:30:00.000Z",
            certificateUrl: CERT_URL,
            npsType: "cdpi_event",
          },
        ],
        pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
});

describe("CertificatesTab — download link", () => {
  it("renders the certificate as a real link so in-app browsers can open it", async () => {
    render(<CertificatesTab />);

    expect(await screen.findByRole("link", { name: /Baixar certificado/i })).toHaveAttribute(
      "href",
      CERT_URL,
    );
  });

  it("opens the certificate in a new tab on browsers that allow it", async () => {
    render(<CertificatesTab />);

    expect(await screen.findByRole("link", { name: /Baixar certificado/i })).toHaveAttribute(
      "target",
      "_blank",
    );
  });

  it("does not leak the opener to the S3 page", async () => {
    render(<CertificatesTab />);

    expect(await screen.findByRole("link", { name: /Baixar certificado/i })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });
});
