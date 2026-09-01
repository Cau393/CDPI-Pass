import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("wouter", () => ({
  useSearch: () => "",
  useLocation: () => ["/admin/cortesias/envio-em-massa", () => {}],
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
    courtesyEmailSubject: null,
    npsType: "cdpi_event" as const,
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

// Typed against globalThis.fetch so the mock keeps fetch's real signature.
// `ReturnType<typeof vi.spyOn>` erases it to (...args: unknown[]) => unknown,
// which no longer accepts a (input: RequestInfo | URL) implementation.
let fetchSpy: MockInstance<typeof globalThis.fetch>;

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

      if (url.includes("courtesy-unredeemed-total")) {
        return new Response(JSON.stringify({ totalRemainingSlots: 12 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

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

      if (
        url.includes("/api/admin/courtesy/mass-send") ||
        (url.includes("/courtesy/mass-send") && !url.includes("mass-send-recipients"))
      ) {
        return new Response(
          JSON.stringify({ message: "Processamento iniciado." }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        );
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

  it("Envio faz POST para /api/admin/courtesy/mass-send quando o CSV está anexado", async () => {
    const user = userEvent.setup();
    render(<CourtesyMassSendingPage />, { wrapper: Wrapper });

    const csvInput = screen.getByLabelText(/arquivo csv/i, { exact: false });
    const csv = new File(
      [
        "name,email,amount_of_courtesies,event_id\nA,a@b.co,1,00000000-0000-4000-8000-000000000001\n",
      ],
      "rows.csv",
      { type: "text/csv" },
    );
    await user.upload(csvInput, csv);

    await user.click(screen.getByRole("button", { name: /enviar e-mails/i }));

    await waitFor(() => {
      const massSendCalls = fetchSpy.mock.calls.filter(([req]) => {
        const url = typeof req === "string" ? req : req.toString();
        return url.includes("/api/admin/courtesy/mass-send");
      });
      expect(massSendCalls.length).toBeGreaterThan(0);
      const last = massSendCalls[massSendCalls.length - 1];
      expect((last[1] as RequestInit)?.method).toBe("POST");
    });
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

describe("CourtesyMassSendingPage — aba Resgate Pendente (T-09+)", () => {
  it("T-09: exibe a aba Resgate Pendente", () => {
    render(<CourtesyMassSendingPage />, { wrapper: Wrapper });
    expect(
      screen.getByRole("tab", { name: /resgate pendente/i }),
    ).toBeInTheDocument();
  });

  it("exibe Cortesias Não Resgatadas e total após escolher evento", async () => {
    const user = userEvent.setup();
    render(<CourtesyMassSendingPage />, { wrapper: Wrapper });
    await user.click(screen.getByRole("tab", { name: /resgate pendente/i }));

    expect(screen.getByText(/cortesias não resgatadas/i)).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();

    const combobox = await screen.findByRole("combobox");
    await user.click(combobox);
    const option = await screen.findByText("Evento Massa", { exact: false });
    await user.click(option);

    await waitFor(() => {
      expect(screen.getByText("12")).toBeInTheDocument();
    });
  });

  it("T-10: aba Resgate Pendente exibe seletor de evento, upload de anexo e botão Enviar", async () => {
    const user = userEvent.setup();
    render(<CourtesyMassSendingPage />, { wrapper: Wrapper });
    await user.click(screen.getByRole("tab", { name: /resgate pendente/i }));
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByLabelText(/anexo/i, { exact: false })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /enviar/i }),
    ).toBeInTheDocument();
  });

  it("T-11: botão Enviar fica desabilitado enquanto nenhum evento é selecionado", async () => {
    const user = userEvent.setup();
    render(<CourtesyMassSendingPage />, { wrapper: Wrapper });
    await user.click(screen.getByRole("tab", { name: /resgate pendente/i }));
    expect(screen.getByRole("button", { name: /enviar/i })).toBeDisabled();
  });

  it("T-12: clicar Enviar com evento selecionado faz POST em /api/admin/events/:id/reminder-send", async () => {
    const user = userEvent.setup();
    render(<CourtesyMassSendingPage />, { wrapper: Wrapper });
    await user.click(screen.getByRole("tab", { name: /resgate pendente/i }));

    const combobox = await screen.findByRole("combobox");
    await user.click(combobox);
    const option = await screen.findByText("Evento Massa", { exact: false });
    await user.click(option);

    const sendBtn = screen.getByRole("button", { name: /enviar/i });
    expect(sendBtn).not.toBeDisabled();
    await user.click(sendBtn);

    await waitFor(() => {
      const postCall = (fetchSpy.mock.calls as [RequestInfo | URL, RequestInit | undefined][]).find(
        ([url]) => typeof url === "string" && url.includes("reminder-send"),
      );
      expect(postCall).toBeDefined();
      expect((postCall![1] as RequestInit).method).toBe("POST");
    });
  });

  it("T-13: quando a API retorna erro, exibe mensagem em português", async () => {
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("courtesy-unredeemed-total")) {
        return new Response(JSON.stringify({ totalRemainingSlots: 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/admin/events") && !url.includes("reminder-send") && !url.includes("mass-send")) {
        return new Response(JSON.stringify(MOCK_EVENTS), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("reminder-send")) {
        return new Response(
          JSON.stringify({ message: "Evento indisponível para envio." }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    });

    const user = userEvent.setup();
    render(<CourtesyMassSendingPage />, { wrapper: Wrapper });
    await user.click(screen.getByRole("tab", { name: /resgate pendente/i }));

    const combobox = await screen.findByRole("combobox");
    await user.click(combobox);
    const option = await screen.findByText("Evento Massa", { exact: false });
    await user.click(option);

    await user.click(screen.getByRole("button", { name: /enviar/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/evento indispon/i),
      ).toBeInTheDocument();
    });
  });
});
