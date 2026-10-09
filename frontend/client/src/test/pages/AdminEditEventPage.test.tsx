import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RegistrationField } from "@shared/eventRegistrationForm";

vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn(() => ({
    getHTML: vi.fn(() => "<p>desc</p>"),
    setEditable: vi.fn(),
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
  })),
  EditorContent: () => <div data-testid="tiptap-editor" />,
}));

const EVENT_ID = "33333333-3333-3333-3333-333333333333";

vi.mock("wouter", () => ({
  useParams: () => ({ id: EVENT_ID }),
  useLocation: () => [`/admin/events/${EVENT_ID}/edit`, vi.fn()],
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

import AdminEditEventPage from "../../pages/AdminEditEventPage";

const activeQuestion: RegistrationField = {
  id: "q-area",
  type: "select",
  label: "Área de interesse",
  options: ["Pesquisa", "Indústria"],
  required: true,
  archived: false,
};
const secondQuestion: RegistrationField = {
  id: "q-cargo",
  type: "text",
  label: "Cargo",
  options: [],
  required: false,
  archived: false,
};
const archivedQuestion: RegistrationField = {
  id: "q-old",
  type: "text",
  label: "Pergunta antiga",
  options: [],
  required: false,
  archived: true,
};

const event = {
  id: EVENT_ID,
  title: "Congresso CDPI 2026",
  description: "<p>desc</p>",
  date: "2026-11-03T12:00:00.000Z",
  location: "São Paulo",
  price: "100.00",
  imageUrl: null,
  npsType: "cdpi_event",
  isFree: false,
  modality: "presencial",
  meetingUrl: null,
  meetingPassword: null,
  whatsappGroupUrl: null,
  confirmationEmailHtml: null,
  courtesyLimit: null,
  salesClosed: false,
  updatedAt: "2026-10-01T12:00:00.000Z",
  interestAreas: ["Pesquisa", "Indústria"],
  registrationForm: [activeQuestion, archivedQuestion],
};

function mockApi(eventRow: Record<string, unknown> = event) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    if (url.endsWith("/print-settings")) return json({ isEnabled: false });
    if (url.endsWith(`/api/admin/events/${EVENT_ID}`) && method === "PATCH") return json(eventRow);
    if (url.endsWith(`/api/admin/events/${EVENT_ID}`)) return json(eventRow);
    return json({});
  });
}

function patchBodies(fetchMock: ReturnType<typeof mockApi>): FormData[] {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
    .map(([, init]) => (init as RequestInit).body as FormData);
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminEditEventPage />
    </QueryClientProvider>,
  );
}

describe("AdminEditEventPage — Formulário de inscrição", () => {
  let fetchMock: ReturnType<typeof mockApi>;

  beforeEach(() => {
    fetchMock = mockApi();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("prefills only the active questions", async () => {
    renderPage();

    expect(await screen.findByLabelText("Pergunta 1")).toHaveValue("Área de interesse");
    expect(screen.queryByDisplayValue("Pergunta antiga")).not.toBeInTheDocument();
  });

  it("sends the edited form with the saved question's id and no interest areas", async () => {
    const user = userEvent.setup();
    renderPage();

    const label = await screen.findByLabelText("Pergunta 1");
    await user.clear(label);
    await user.type(label, "Área de atuação");
    await user.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(1));
    const [body] = patchBodies(fetchMock);
    expect({
      registrationForm: JSON.parse(String(body.get("registration_form"))),
      interestAreas: body.get("interest_areas"),
    }).toEqual({
      registrationForm: [
        {
          id: "q-area",
          type: "select",
          label: "Área de atuação",
          options: ["Pesquisa", "Indústria"],
          required: true,
        },
      ],
      interestAreas: null,
    });
  });

  it("sends an empty form when the admin removes the only question", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Remover pergunta 1" }));
    await user.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(1));
    expect(patchBodies(fetchMock)[0].get("registration_form")).toBe("[]");
  });

  it("leaves the form out of a save that did not touch it", async () => {
    const user = userEvent.setup();
    renderPage();

    const title = await screen.findByDisplayValue("Congresso CDPI 2026");
    await user.type(title, " - edição 2");
    await user.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(1));
    expect(Array.from(patchBodies(fetchMock)[0].keys())).toEqual(["updated_at", "title"]);
  });

  it("sends the updatedAt it loaded so the server can detect a concurrent edit", async () => {
    const user = userEvent.setup();
    renderPage();

    const title = await screen.findByDisplayValue("Congresso CDPI 2026");
    await user.type(title, " - edição 2");
    await user.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(1));
    expect(patchBodies(fetchMock)[0].get("updated_at")).toBe("2026-10-01T12:00:00.000Z");
  });

  it("tells the admin to reload when another person changed the event (409)", async () => {
    const message = "Este evento foi alterado por outra pessoa. Recarregue a página.";
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const json = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
      if (String(input).endsWith("/print-settings")) return json(200, { isEnabled: false });
      if (init?.method === "PATCH") return json(409, { message });
      return json(200, event);
    });
    const user = userEvent.setup();
    renderPage();

    const title = await screen.findByDisplayValue("Congresso CDPI 2026");
    await user.type(title, " - edição 2");
    await user.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ description: message })),
    );
  });

  it("closes sales without re-sending the form or interest areas", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("button-toggle-sales"));
    await user.click(await screen.findByRole("button", { name: "Encerrar vendas" }));

    await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(1));
    expect(Array.from(patchBodies(fetchMock)[0].keys())).toEqual(["sales_closed"]);
  });
});

describe("AdminEditEventPage — reordering and removing questions", () => {
  const twoQuestions = {
    ...event,
    registrationForm: [activeQuestion, secondQuestion, archivedQuestion],
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function sentForm(fetchMock: ReturnType<typeof mockApi>): unknown {
    return JSON.parse(String(patchBodies(fetchMock)[0].get("registration_form")));
  }

  it("sends the new order when the admin only moves a question", async () => {
    const fetchMock = mockApi(twoQuestions);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Mover pergunta 2 para cima" }));
    await user.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(1));
    expect((sentForm(fetchMock) as { id: string }[]).map((field) => field.id)).toEqual([
      "q-cargo",
      "q-area",
    ]);
  });

  it("sends the remaining questions when the admin removes one of many", async () => {
    const fetchMock = mockApi(twoQuestions);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Remover pergunta 1" }));
    await user.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(1));
    expect((sentForm(fetchMock) as { id: string }[]).map((field) => field.id)).toEqual([
      "q-cargo",
    ]);
  });
});
