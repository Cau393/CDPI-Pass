import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("wouter", () => ({
  useSearch: () => "",
  useLocation: () => ["/cortesia-envio-em-massa", () => {}],
}));

vi.mock("../../lib/exportMassSendExcel", () => ({
  exportMassSendToXlsx: vi.fn(),
}));

import CourtesyMassSendingPage from "../../pages/CourtesyMassSendingPage";
import { exportMassSendToXlsx } from "../../lib/exportMassSendExcel";

const mockedExportMassSend = vi.mocked(exportMassSendToXlsx);

const MOCK_EVENTS = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Evento Massa",
    description: "D",
    date: "2026-06-01T10:00:00Z",
    location: "SP",
    price: "0.00",
    imageUrl: null,
    maxAttendees: 100,
    currentAttendees: 0,
    isActive: true,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    certificateTemplateUrl: null,
    courtesyTemplate: null,
  },
];

const MOCK_RECIPIENTS = {
  data: [
    {
      id: "00000000-0000-4000-8000-0000000000aa",
      code: "CDPITST1",
      recipientName: "Caue",
      recipientEmail: "caue@email.com",
      ticketCount: 3,
      usedCount: 1,
      remaining: 2,
      isActive: true,
      createdAt: "2026-04-20T12:00:00.000Z",
    },
  ],
  total: 1,
};

const MOCK_REDEMPTIONS = {
  link: {
    id: "00000000-0000-4000-8000-0000000000aa",
    code: "CDPITST1",
    eventId: "00000000-0000-4000-8000-000000000001",
    eventTitle: "Evento Massa",
    recipientName: "Caue",
    recipientEmail: "caue@email.com",
    ticketCount: 3,
    usedCount: 1,
  },
  data: [
    {
      orderId: "00000000-0000-4000-8000-0000000000bb",
      orderStatus: "paid",
      amntUsed: 0,
      maxUses: 1,
      attendeeName: "Maria",
      attendeeEmail: "m@p.com",
      attendeeCpf: "111.111.111-11",
      attendeePhone: "(11) 99999-9999",
      checkedIn: false,
      checkedInAt: null,
      createdAt: "2026-04-21T10:00:00.000Z",
    },
  ],
  total: 1,
};

let fetchSpy: ReturnType<typeof vi.spyOn>;

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
          if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
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

beforeEach(() => {
  localStorage.setItem("token", "fake-token");

  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/api/admin/events") && !url.includes("mass-send-recipients") && !url.includes("courtesy-links")) {
        return new Response(JSON.stringify(MOCK_EVENTS), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("mass-send-recipients")) {
        if (url.includes("00000000-0000-4000-8000-000000000001")) {
          return new Response(JSON.stringify(MOCK_RECIPIENTS), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      if (url.includes("courtesy-links") && url.includes("redemptions")) {
        return new Response(JSON.stringify(MOCK_REDEMPTIONS), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/auth/me")) {
        return new Response(
          JSON.stringify({
            id: "u1",
            name: "Admin",
            email: "a@test.com",
            isAdmin: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("mass-send") && input instanceof Request) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      return new Response("Not found", { status: 404 });
    },
  );
});

afterEach(() => {
  fetchSpy.mockRestore();
  localStorage.clear();
  vi.clearAllMocks();
});

describe("CourtesyMassSendingPage (T-06+)", () => {
  it("T-06: exibe as abas Envio e Visualizar; a aba Envio mostra o formulário de CSV", () => {
    render(<CourtesyMassSendingPage />, { wrapper: Wrapper });
    expect(screen.getByRole("tab", { name: "Envio" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Visualizar" })).toBeInTheDocument();
    expect(
      screen.getByLabelText(/arquivo csv/i, { exact: false }),
    ).toBeInTheDocument();
  });

  it("T-07: abre Visualizar, seleciona evento e carrega a lista de destinatários", async () => {
    const user = userEvent.setup();
    render(<CourtesyMassSendingPage />, { wrapper: Wrapper });
    await user.click(screen.getByRole("tab", { name: "Visualizar" }));

    const combobox = await screen.findByRole("combobox");
    await user.click(combobox);
    const option = await screen.findByText("Evento Massa", { exact: false });
    await user.click(option);

    await waitFor(() => {
      expect(screen.getByText("Caue")).toBeInTheDocument();
    });
    expect(screen.getByText("caue@email.com")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    const cells = screen.getAllByText("3");
    expect(cells.length).toBeGreaterThanOrEqual(1);
  });

  it("T-08: clique na linha abre a lista de resgates; Voltar retorna sem perder o evento", async () => {
    const user = userEvent.setup();
    render(<CourtesyMassSendingPage />, { wrapper: Wrapper });
    await user.click(screen.getByRole("tab", { name: "Visualizar" }));

    const combobox = await screen.findByRole("combobox");
    await user.click(combobox);
    const option = await screen.findByText("Evento Massa", { exact: false });
    await user.click(option);

    await waitFor(() => {
      expect(screen.getByText("Caue")).toBeInTheDocument();
    });

    const caueCell = screen.getByText("Caue");
    const tr = caueCell.closest("tr");
    expect(tr).toBeTruthy();
    await user.click(tr!);

    await waitFor(() => {
      expect(screen.getByText("Maria")).toBeInTheDocument();
    });
    expect(screen.queryByText("Nenhum resgate ainda.")).not.toBeInTheDocument();

    const back = screen.getByRole("button", { name: /voltar/i });
    await user.click(back);

    await waitFor(() => {
      expect(screen.getByText("Caue")).toBeInTheDocument();
    });
  });

  it("does not show Exportar para Excel before selecting an event on Visualizar", async () => {
    const user = userEvent.setup();
    render(<CourtesyMassSendingPage />, { wrapper: Wrapper });
    await user.click(screen.getByRole("tab", { name: "Visualizar" }));
    expect(screen.queryByTestId("mass-send-export-excel")).toBeNull();
  });

  it("shows Exportar para Excel after selecting an event on Visualizar", async () => {
    const user = userEvent.setup();
    render(<CourtesyMassSendingPage />, { wrapper: Wrapper });
    await user.click(screen.getByRole("tab", { name: "Visualizar" }));

    const combobox = await screen.findByRole("combobox");
    await user.click(combobox);
    const option = await screen.findByText("Evento Massa", { exact: false });
    await user.click(option);

    await waitFor(() => {
      expect(screen.getByTestId("mass-send-export-excel")).toBeInTheDocument();
    });
  });

  it("hides Exportar para Excel on redeemers detail view and shows again after Voltar", async () => {
    const user = userEvent.setup();
    render(<CourtesyMassSendingPage />, { wrapper: Wrapper });
    await user.click(screen.getByRole("tab", { name: "Visualizar" }));

    const combobox = await screen.findByRole("combobox");
    await user.click(combobox);
    const option = await screen.findByText("Evento Massa", { exact: false });
    await user.click(option);

    await waitFor(() => {
      expect(screen.getByTestId("mass-send-export-excel")).toBeInTheDocument();
    });

    const caueCell = screen.getByText("Caue");
    const tr = caueCell.closest("tr");
    expect(tr).toBeTruthy();
    await user.click(tr!);

    await waitFor(() => {
      expect(screen.getByText("Maria")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("mass-send-export-excel")).toBeNull();

    await user.click(screen.getByRole("button", { name: /voltar/i }));

    await waitFor(() => {
      expect(screen.getByTestId("mass-send-export-excel")).toBeInTheDocument();
    });
  });

  it("calls exportMassSendToXlsx with fetched recipients when clicking Exportar para Excel", async () => {
    const user = userEvent.setup();
    render(<CourtesyMassSendingPage />, { wrapper: Wrapper });
    await user.click(screen.getByRole("tab", { name: "Visualizar" }));

    const combobox = await screen.findByRole("combobox");
    await user.click(combobox);
    const option = await screen.findByText("Evento Massa", { exact: false });
    await user.click(option);

    await waitFor(() => {
      expect(screen.getByTestId("mass-send-export-excel")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("mass-send-export-excel"));

    await waitFor(() => {
      expect(mockedExportMassSend).toHaveBeenCalledTimes(1);
    });
    expect(mockedExportMassSend).toHaveBeenCalledWith(
      MOCK_RECIPIENTS.data,
      "Evento Massa",
    );
  });
});
