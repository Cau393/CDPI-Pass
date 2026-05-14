import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminCommercialSalesPage from "../../pages/AdminCommercialSalesPage";

const MOCK_EVENTS = [
  {
    id: "evt-1",
    title: "Evento Teste",
    description: "Descrição",
    date: "2026-06-01T10:00:00Z",
    location: "São Paulo",
    price: "100.00",
    imageUrl: null,
    maxAttendees: 100,
    currentAttendees: 2,
    isActive: true,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    certificateTemplateUrl: null,
    courtesyTemplate: null,
    courtesyEmailSubject: null,
    npsType: "cdpi_event" as const,
  },
];

/** Mirrors GET /api/admin/events/:eventId/commercial-sales (paid/pending, amount > 0, not courtesy). */
const MOCK_SALES = [
  {
    id: "ord-1",
    vendedor: "Maria Admin",
    status: "pago",
    orderDbStatus: "paid" as const,
    paymentMethod: "credit_card",
    nome: "João Silva",
    cpf: "123.456.789-00",
    email: "joao@email.com",
    telefone: "+5511999999999",
  },
  {
    id: "ord-2",
    vendedor: "N/A",
    status: "pendente",
    orderDbStatus: "pending" as const,
    paymentMethod: "credit_card",
    nome: "Ana Souza",
    cpf: "987.654.321-00",
    email: "ana@email.com",
    telefone: "+5521888888888",
  },
];

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
        queryFn: async ({ queryKey }) => {
          const token = localStorage.getItem("token");
          const headers: HeadersInit = {};
          if (token) headers["Authorization"] = `Bearer ${token}`;
          const res = await fetch(queryKey.join("/") as string, {
            headers,
            credentials: "include",
          });
          if (!res.ok) throw new Error(`${res.status}`);
          return res.json();
        },
      },
    },
  });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = createQueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.setItem("token", "fake-token");

  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/api/admin/events") && !url.includes("commercial-sales")) {
        return new Response(JSON.stringify(MOCK_EVENTS), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("commercial-sales")) {
        return new Response(JSON.stringify(MOCK_SALES), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/admin/orders/") && url.includes("mark-paid-external")) {
        return new Response(
          JSON.stringify({ success: true, message: "ok" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/api/auth/me")) {
        return new Response(
          JSON.stringify({ id: "u1", name: "Admin", email: "admin@test.com", isAdmin: true }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response("Not found", { status: 404 });
    },
  );
});

afterEach(() => {
  fetchSpy.mockRestore();
  localStorage.clear();
});

describe("AdminCommercialSalesPage", () => {
  it("shows empty state before selecting an event", () => {
    render(<AdminCommercialSalesPage />, { wrapper: Wrapper });

    expect(
      screen.getByText("Selecione um evento para ver as vendas do comercial."),
    ).toBeInTheDocument();
  });

  it("renders the table with correct rows and badge colors after selecting an event", async () => {
    const user = userEvent.setup();
    render(<AdminCommercialSalesPage />, { wrapper: Wrapper });

    const trigger = await screen.findByRole("combobox");
    await user.click(trigger);

    const option = await screen.findByText("Evento Teste", { exact: false });
    await user.click(option);

    await waitFor(() => {
      expect(screen.getByText("João Silva")).toBeInTheDocument();
    });

    expect(screen.getByText("Ana Souza")).toBeInTheDocument();

    expect(screen.getByText("Maria Admin")).toBeInTheDocument();

    const naCells = screen.getAllByText("N/A");
    expect(naCells.length).toBeGreaterThanOrEqual(1);

    const pagoBadges = screen.getAllByText("Pago");
    expect(pagoBadges).toHaveLength(1);
    for (const badge of pagoBadges) {
      expect(badge.className).toContain("bg-green-600");
    }

    const pendenteBadges = screen.getAllByText("Pendente");
    expect(pendenteBadges).toHaveLength(1);
    expect(pendenteBadges[0].className).toContain("bg-amber-500");
  });

  it("renders the correct number of table rows", async () => {
    const user = userEvent.setup();
    render(<AdminCommercialSalesPage />, { wrapper: Wrapper });

    const trigger = await screen.findByRole("combobox");
    await user.click(trigger);

    const option = await screen.findByText("Evento Teste", { exact: false });
    await user.click(option);

    await waitFor(() => {
      expect(screen.getByText("João Silva")).toBeInTheDocument();
    });

    const rows = screen.getAllByRole("row");
    // 1 header row + 2 data rows = 3
    expect(rows).toHaveLength(3);
  });

  it("shows Pago por meios externos and Cancelar for pending credit card only", async () => {
    const user = userEvent.setup();
    render(<AdminCommercialSalesPage />, { wrapper: Wrapper });

    const trigger = await screen.findByRole("combobox");
    await user.click(trigger);
    const option = await screen.findByText("Evento Teste", { exact: false });
    await user.click(option);

    await waitFor(() => {
      expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Pago por meios externos/i })).toBeInTheDocument();
    const cancelButtons = screen.getAllByRole("button", { name: /^Cancelar$/ });
    expect(cancelButtons).toHaveLength(1);
  });

  it("does not show cancel or external paid actions for paid rows", async () => {
    const user = userEvent.setup();
    const salesPaidOnly = [
      {
        id: "ord-1",
        vendedor: "Maria",
        status: "pago",
        orderDbStatus: "paid" as const,
        paymentMethod: "credit_card",
        nome: "João Silva",
        cpf: "123.456.789-00",
        email: "j@a.com",
        telefone: "1",
      },
    ];
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/admin/events") && !url.includes("commercial-sales")) {
        return new Response(JSON.stringify(MOCK_EVENTS), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("commercial-sales")) {
        return new Response(JSON.stringify(salesPaidOnly), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/auth/me")) {
        return new Response(
          JSON.stringify({ id: "u1", name: "Admin", email: "a@test.com", isAdmin: true }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    });

    render(<AdminCommercialSalesPage />, { wrapper: Wrapper });
    const combobox = await screen.findByRole("combobox");
    await user.click(combobox);
    const option = await screen.findByText("Evento Teste", { exact: false });
    await user.click(option);

    await waitFor(() => {
      expect(screen.getByText("João Silva")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /^Cancelar$/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Pago por meios externos/i }),
    ).toBeNull();
  });

  it("does not show Pago por meios externos for pending PIX but keeps Cancelar", async () => {
    const user = userEvent.setup();
    const salesPixPending = [
      {
        id: "ord-pix",
        vendedor: "N/A",
        status: "pendente",
        orderDbStatus: "pending" as const,
        paymentMethod: "pix",
        nome: "Bia Pix",
        cpf: "999.888.777-66",
        email: "bia@x.com",
        telefone: "0",
      },
    ];
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/admin/events") && !url.includes("commercial-sales")) {
        return new Response(JSON.stringify(MOCK_EVENTS), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("commercial-sales")) {
        return new Response(JSON.stringify(salesPixPending), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/auth/me")) {
        return new Response(
          JSON.stringify({ id: "u1", name: "Admin", email: "a@test.com", isAdmin: true }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    });

    render(<AdminCommercialSalesPage />, { wrapper: Wrapper });
    await user.click(await screen.findByRole("combobox"));
    await user.click(await screen.findByText("Evento Teste", { exact: false }));

    await waitFor(() => {
      expect(screen.getByText("Bia Pix")).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("button", { name: /Pago por meios externos/i }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: /^Cancelar$/ })).toBeInTheDocument();
  });
});
