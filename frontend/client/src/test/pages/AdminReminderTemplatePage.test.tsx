import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("wouter", () => ({
  useSearch: () => "?tab=lembrete",
  useLocation: () => ["/admin/templates", () => {}],
}));

// Tiptap does not initialize ProseMirror in jsdom — use a minimal stub.
// The mock editor must be a stable reference so the effect deps don't change on every render.
let capturedOnUpdate: (() => void) | null = null;
const stableMockEditor = {
  getHTML: vi.fn(() => "<p>conteúdo teste</p>"),
  commands: { setContent: vi.fn(), clearContent: vi.fn() },
  can: () => ({ undo: () => false, redo: () => false }),
  isActive: vi.fn(() => false),
  chain: () => ({
    focus: () => ({
      toggleBold: () => ({ run: vi.fn() }),
      toggleItalic: () => ({ run: vi.fn() }),
      toggleUnderline: () => ({ run: vi.fn() }),
      setTextAlign: () => ({ run: vi.fn() }),
      toggleBulletList: () => ({ run: vi.fn() }),
      toggleOrderedList: () => ({ run: vi.fn() }),
      undo: () => ({ run: vi.fn() }),
      redo: () => ({ run: vi.fn() }),
    }),
  }),
};
vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn((config: any) => {
    capturedOnUpdate = config?.onUpdate ?? null;
    return stableMockEditor;
  }),
  EditorContent: ({ editor: _editor }: any) => (
    <div role="textbox" aria-multiline contentEditable suppressContentEditableWarning data-testid="tiptap-editor" />
  ),
}));

import AdminReminderTemplatePage from "../../pages/AdminReminderTemplatePage";

const MOCK_EVENTS = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Evento Teste",
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
    isFree: false,
    salesClosed: false,
  },
];

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
  return (
    <QueryClientProvider client={createQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.setItem("token", "fake-token");

  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/api/admin/events") && !url.includes("reminder-template")) {
        return new Response(JSON.stringify(MOCK_EVENTS), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("reminder-template")) {
        return new Response(
          JSON.stringify({ body: "<p>Olá {nome}</p>", subject: "" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
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

describe("AdminReminderTemplatePage", () => {
  it("T-14: renderiza o título e o seletor de evento", async () => {
    render(<AdminReminderTemplatePage />, { wrapper: Wrapper });
    expect(
      screen.getByRole("heading", { name: /template.*lembrete/i }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
  });

  it("T-15: exibe variáveis dinâmicas {nome}, {evento}, {data}, {link} ao selecionar evento", async () => {
    const user = userEvent.setup();
    render(<AdminReminderTemplatePage />, { wrapper: Wrapper });
    const combobox = await screen.findByRole("combobox");
    await user.click(combobox);
    const option = await screen.findByText("Evento Teste", { exact: false });
    await user.click(option);
    await waitFor(() => {
      expect(screen.getByText("{nome}")).toBeInTheDocument();
    });
    expect(screen.getByText("{evento}")).toBeInTheDocument();
    expect(screen.getByText("{data}")).toBeInTheDocument();
    expect(screen.getByText("{link}")).toBeInTheDocument();
  });

  it("T-16: carrega template existente ao selecionar evento e exibe botão Salvar", async () => {
    const user = userEvent.setup();
    render(<AdminReminderTemplatePage />, { wrapper: Wrapper });

    const combobox = await screen.findByRole("combobox");
    await user.click(combobox);
    const option = await screen.findByText("Evento Teste", { exact: false });
    await user.click(option);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /salvar/i })).toBeInTheDocument();
    });
  });

  it("T-17: clicar em Salvar envia PATCH para /api/admin/events/:id/reminder-template com subject", async () => {
    let patchCalled = false;
    let patchBody: unknown = null;
    fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/admin/events") && !url.includes("reminder-template")) {
        return new Response(JSON.stringify(MOCK_EVENTS), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("reminder-template") && method === "GET") {
        return new Response(JSON.stringify({ body: "", subject: "Lembrete {evento}" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("reminder-template") && method === "PATCH") {
        patchCalled = true;
        try {
          patchBody =
            typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
        } catch {
          patchBody = null;
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    });

    const user = userEvent.setup();
    render(<AdminReminderTemplatePage />, { wrapper: Wrapper });

    const combobox = await screen.findByRole("combobox");
    await user.click(combobox);
    const option = await screen.findByText("Evento Teste", { exact: false });
    await user.click(option);

    // Wait for template load to settle (isDirty reset to false by the effect)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /salvar/i })).toBeInTheDocument();
    });

    // Now trigger the Tiptap onUpdate callback to mark isDirty=true
    await act(async () => {
      capturedOnUpdate?.();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /salvar/i })).not.toBeDisabled();
    });

    await user.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => {
      expect(patchCalled).toBe(true);
    });
    expect(patchBody).toEqual(
      expect.objectContaining({
        body: "<p>conteúdo teste</p>",
        subject: "Lembrete {evento}",
      }),
    );
  });
});
