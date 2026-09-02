import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const setLocation = vi.fn();
vi.mock("wouter", () => ({
  useLocation: () => ["/profile", setLocation],
}));

// The page resets its form whenever the user object's identity changes, so the
// mock must hand back the same instance every render or it re-renders forever.
const CURRENT_USER = {
  id: "u1",
  name: "Julliana Rodrigues Moura",
  email: "julliana@example.com",
  isAdmin: false,
};
const AUTH = { isAuthenticated: true, isLoading: false, user: CURRENT_USER };
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => AUTH,
}));

vi.mock("../../hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// CertificatesTab fetches on its own and has its own tests; keep this page test focused.
vi.mock("../../components/CertificatesTab", () => ({
  CertificatesTab: () => <div data-testid="certificates-tab" />,
}));

const downloadDataUrl = vi.fn();
vi.mock("@/lib/downloadDataUrl", () => ({
  downloadDataUrl: (...a: unknown[]) => downloadDataUrl(...a),
}));

const apiRequest = vi.fn();
vi.mock("@/lib/queryClient", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/queryClient")>();
  return {
    ...actual,
    apiRequest: (...a: Parameters<typeof actual.apiRequest>) => apiRequest(...a),
  };
});

import ProfilePage from "../../pages/ProfilePage";

const QR_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

const ORDERS = {
  orders: [
    {
      id: "o1",
      status: "paid",
      paymentMethod: "free",
      amount: "0.00",
      createdAt: "2026-09-01T12:00:00.000Z",
      qrCodeData: QR_DATA_URL,
      event: {
        title: "Workshop - Peptídeos: Biológicos e Sintéticos",
        date: "2026-10-20T11:30:00.000Z",
        location: "Conselho Federal de Farmácia (CFF) - Brasília - DF",
      },
    },
  ],
  totalPages: 1,
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProfilePage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("token", "t");
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    if (String(url).startsWith("/api/orders")) return jsonResponse(ORDERS);
    return jsonResponse({});
  });
});

describe("ProfilePage — tabs on phones", () => {
  it("stacks the four tabs in two columns below the sm breakpoint", async () => {
    renderPage();

    expect(await screen.findByRole("tablist")).toHaveClass("grid-cols-2");
  });

  it("returns to one row of four from the sm breakpoint", async () => {
    renderPage();

    expect(await screen.findByRole("tablist")).toHaveClass("sm:grid-cols-4");
  });

  it("lets the tab list grow taller than one row", async () => {
    renderPage();

    expect(await screen.findByRole("tablist")).toHaveClass("h-auto");
  });

  it("lets a long label wrap instead of overlapping its neighbour", async () => {
    renderPage();

    expect(await screen.findByTestId("tab-profile")).toHaveClass("whitespace-normal");
  });

  it("keeps each tab a 44px touch target on phones", async () => {
    renderPage();

    expect(await screen.findByTestId("tab-profile")).toHaveClass("min-h-11");
  });
});
