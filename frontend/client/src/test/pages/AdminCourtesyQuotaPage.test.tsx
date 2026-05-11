import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminCourtesyQuotaPage from "../../pages/AdminCourtesyQuotaPage";

const toast = vi.fn();

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast,
    dismiss: vi.fn(),
  }),
}));

const apiRequest = vi.fn();

vi.mock("@/lib/queryClient", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/queryClient")>();
  return {
    ...actual,
    apiRequest: (...a: Parameters<typeof actual.apiRequest>) =>
      apiRequest(...a),
  };
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const LOOKUP = {
  link: {
    id: "00000000-0000-4000-8000-0000000000aa",
    code: "CODE1",
    eventId: "00000000-0000-4000-8000-000000000001",
    ticketCount: 10,
    usedCount: 2,
    isActive: true,
  },
  eventTitle: "Meu evento",
};

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AdminCourtesyQuotaPage />
    </QueryClientProvider>,
  );
}

describe("AdminCourtesyQuotaPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("token", "t");
    apiRequest.mockImplementation(async (_method, url) => {
      const u = String(url);
      if (u.includes("/api/admin/courtesy-links") && u.includes("code=")) {
        return jsonResponse(LOOKUP);
      }
      return jsonResponse({});
    });
  });

  it("exige código quando Buscar está vazio", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Buscar/i }));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Informe o código de cortesia ou promoção.",
      }),
    );
  });

  it("ao buscar, mostra resumo do link e link para página de resgatantes (sem GET inline de redemptions)", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/Código/i), "CODE1");
    await user.click(screen.getByRole("button", { name: /^Buscar$/i }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        "GET",
        "/api/admin/courtesy-links?code=CODE1",
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Meu evento/i)).toBeInTheDocument();
    });

    expect(
      apiRequest.mock.calls.some(
        (c) => c[0] === "GET" && String(c[1]).includes("/redemptions"),
      ),
    ).toBe(false);

    const lista = screen.getByRole("link", {
      name: /Ver lista completa de resgatantes/i,
    });
    expect(lista).toHaveAttribute(
      "href",
      `/admin/cortesias/resgates/${
        LOOKUP.link.id
      }?code=CODE1&eventId=${encodeURIComponent(LOOKUP.link.eventId)}`,
    );
  });

  it("não permite salvar limite menor que usos já registrados", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/Código/i), "CODE1");
    await user.click(screen.getByRole("button", { name: /^Buscar$/i }));
    const limitInput = await screen.findByLabelText(/Novo limite/i);
    await waitFor(() => expect(limitInput).toHaveDisplayValue("10"));

    await user.clear(limitInput);
    await user.type(limitInput, "1");

    await waitFor(() => {
      const saveBtn = screen.getByRole("button", { name: /Salvar novo limite/i });
      expect(saveBtn).toBeDisabled();
    });

    expect(
      apiRequest.mock.calls.some((c) => c[0] === "PATCH"),
    ).toBe(false);
  });
});
