import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LEGACY_QUESTIONS, type RegistrationField, type SystemField } from "@shared/eventRegistrationForm";

type Account = {
  id?: string;
  cpf: string | null;
  foreignDocument: string | null;
  isForeigner: boolean;
  address: string | null;
  occupation?: string | null;
  partnerCompany?: string | null;
  areaOfActivity?: string | null;
};
const authState: { user: Account | undefined } = { user: undefined };
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.user, isAuthenticated: true }),
}));

import { EventRegistrationDialog } from "../../components/EventRegistrationDialog";
import { getQueryFn } from "../../lib/queryClient";

const cargo: RegistrationField = {
  id: "q-cargo",
  type: "text",
  label: "Cargo",
  options: [],
  required: true,
  archived: false,
};

const newAccount: Account = { cpf: null, foreignDocument: null, isForeigner: false, address: null };

type DialogEvent = {
  title: string;
  modality: "presencial" | "online";
  isFree: boolean;
  registrationForm: RegistrationField[];
};
const paidInPerson: DialogEvent = {
  title: "Congresso CDPI 2026",
  modality: "presencial",
  isFree: false,
  registrationForm: [cargo],
};
const paidOnline: DialogEvent = { ...paidInPerson, modality: "online", registrationForm: [] };
const freeOnline: DialogEvent = { ...paidInPerson, modality: "online", isFree: true };

type Reply = { status: number; body: unknown };

function reply({ status, body }: Reply): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** PUT /api/profile/identity answers `put`; GET /api/auth/me answers `me` (the account by default). */
function mockIdentity(
  put: Reply | Promise<Reply> = { status: 200, body: {} },
  me: Reply = { status: 200, body: authState.user ?? {} },
) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    if (String(input) === "/api/auth/me") return reply(me);
    return reply(await put);
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

type DialogProps = { open?: boolean; error?: string | null; missing?: SystemField[] };

function renderDialog(event: DialogEvent, props: DialogProps = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(["/api/auth/me"], authState.user);
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const ui = (next: DialogProps) => (
    <QueryClientProvider client={queryClient}>
      <EventRegistrationDialog
        open
        event={event}
        confirmLabel="Continuar"
        onCancel={onCancel}
        onConfirm={onConfirm}
        {...props}
        {...next}
      />
    </QueryClientProvider>
  );
  const { rerender } = render(ui({}));
  return { onConfirm, onCancel, queryClient, rerender: (next: DialogProps) => rerender(ui(next)) };
}

function identityBodies(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
  return fetchMock.mock.calls
    .filter(([url, init]) => url === "/api/profile/identity" && (init as RequestInit).method === "PUT")
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

describe("EventRegistrationDialog", () => {
  beforeEach(() => {
    authState.user = { ...newAccount };
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("saves a Brazilian's CPF and address on an in-person event", async () => {
    const fetchMock = mockIdentity();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDialog(paidInPerson);

    await user.type(screen.getByLabelText("CPF"), "12345678909");
    await user.type(screen.getByLabelText("Endereço"), "Rua A, 100, São Paulo");
    await user.type(screen.getByLabelText(/Cargo/), "Farmacêutica");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => {
      expect(identityBodies(fetchMock)).toEqual([
        { cpf: "123.456.789-09", address: "Rua A, 100, São Paulo" },
      ]);
    });
  });

  it("returns the answers after saving the identity", async () => {
    vi.stubGlobal("fetch", mockIdentity());
    const user = userEvent.setup();
    const { onConfirm } = renderDialog(paidInPerson);

    await user.type(screen.getByLabelText("CPF"), "12345678909");
    await user.type(screen.getByLabelText("Endereço"), "Rua A, 100, São Paulo");
    await user.type(screen.getByLabelText(/Cargo/), " Farmacêutica ");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith({ "q-cargo": "Farmacêutica" });
    });
  });

  it("refreshes the cached account before continuing", async () => {
    const refreshed = { ...newAccount, cpf: "123.456.789-09" };
    vi.stubGlobal("fetch", mockIdentity({ status: 200, body: refreshed }, { status: 200, body: refreshed }));
    const user = userEvent.setup();
    const { onConfirm, queryClient } = renderDialog(paidOnline);

    await user.type(screen.getByLabelText("CPF"), "12345678909");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(queryClient.getQueryData(["/api/auth/me"])).toEqual(refreshed);
  });

  it("does not continue when the account cannot be refreshed after saving", async () => {
    vi.stubGlobal(
      "fetch",
      mockIdentity({ status: 200, body: {} }, { status: 500, body: { message: "Erro interno" } }),
    );
    const user = userEvent.setup();
    const { onConfirm } = renderDialog(paidOnline);

    await user.type(screen.getByLabelText("CPF"), "12345678909");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível atualizar seus dados. Tente novamente.",
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("saves a foreign visitor's passport on a paid online event", async () => {
    const fetchMock = mockIdentity();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDialog(paidOnline);

    await user.click(screen.getByLabelText("Sou estrangeiro / I'm a foreign visitor"));
    await user.type(screen.getByLabelText("Passaporte / Passport"), "ab123456");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => {
      expect(identityBodies(fetchMock)).toEqual([
        { isForeigner: true, foreignDocument: "AB123456" },
      ]);
    });
  });

  it("tells foreign visitors they pay by international card on a paid event", () => {
    renderDialog(paidOnline);
    expect(
      screen.getByText(
        "Estrangeiros pagam apenas com cartão de crédito internacional / Foreign visitors pay by international credit card only",
      ),
    ).toBeInTheDocument();
  });

  it("shows a document conflict inline and does not continue", async () => {
    vi.stubGlobal(
      "fetch",
      mockIdentity({
        status: 409,
        body: { message: "Este documento já está cadastrado em outra conta." },
      }),
    );
    const user = userEvent.setup();
    const { onConfirm } = renderDialog(paidOnline);

    await user.type(screen.getByLabelText("CPF"), "12345678909");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este documento já está cadastrado em outra conta.",
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("asks only the custom questions on a free online event", async () => {
    const fetchMock = mockIdentity();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onConfirm } = renderDialog(freeOnline);

    expect(screen.queryByLabelText("CPF")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Cargo/), "Farmacêutica");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ "q-cargo": "Farmacêutica" }));
    expect(identityBodies(fetchMock)).toEqual([]);
  });

  describe("legacy profile questions", () => {
    const legacyForm: RegistrationField[] = LEGACY_QUESTIONS.map((q) => ({
      id: q.id,
      type: "text",
      label: q.label,
      options: [],
      required: true,
      archived: false,
    }));
    const legacyEvent: DialogEvent = { ...freeOnline, registrationForm: legacyForm };

    it("prefills the real profile values, editable, and confirms them", async () => {
      authState.user = {
        ...newAccount,
        occupation: "Médica",
        partnerCompany: "Clínica Aurora",
        areaOfActivity: "Pesquisa",
      };
      const user = userEvent.setup();
      const { onConfirm } = renderDialog(legacyEvent);

      const occupation = screen.getByLabelText(/Cargo que ocupa/);
      expect(occupation).toHaveValue("Médica");
      expect(screen.getByLabelText(/Empresa que trabalha/)).toHaveValue("Clínica Aurora");
      expect(screen.getByLabelText(/Área de atuação/)).toHaveValue("Pesquisa");
      await user.clear(occupation);
      await user.type(occupation, "Diretora");
      await user.click(screen.getByRole("button", { name: "Continuar" }));

      await waitFor(() =>
        expect(onConfirm).toHaveBeenCalledWith({
          "legacy-occupation": "Diretora",
          "legacy-partner-company": "Clínica Aurora",
          "legacy-area-of-activity": "Pesquisa",
        }),
      );
    });

    it("prefills when the account arrives after the dialog opened, keeping a typed draft", async () => {
      authState.user = undefined;
      const user = userEvent.setup();
      const { rerender } = renderDialog(legacyEvent);
      await user.type(screen.getByLabelText(/Empresa que trabalha/), "Rascunho");

      authState.user = { ...newAccount, id: "u1", occupation: "Médica", partnerCompany: "Clínica", areaOfActivity: "Pesquisa" };
      rerender({});

      await waitFor(() => expect(screen.getByLabelText(/Cargo que ocupa/)).toHaveValue("Médica"));
      expect(screen.getByLabelText(/Empresa que trabalha/)).toHaveValue("Rascunho");
      expect(screen.getByLabelText(/Área de atuação/)).toHaveValue("Pesquisa");
    });

    it("leaves a 4-field account's questions empty (the placeholder is not a value)", async () => {
      authState.user = {
        ...newAccount,
        occupation: "Nao aplicavel",
        partnerCompany: "Nao aplicavel",
        areaOfActivity: "Nao aplicavel",
      };
      const user = userEvent.setup();
      const { onConfirm } = renderDialog(legacyEvent);

      expect(screen.getByLabelText(/Cargo que ocupa/)).toHaveValue("");
      await user.click(screen.getByRole("button", { name: "Continuar" }));
      expect(onConfirm).not.toHaveBeenCalled();
      expect(screen.getByLabelText(/Cargo que ocupa/)).toHaveAccessibleDescription(
        "Responda a pergunta obrigatória: Cargo que ocupa",
      );
    });

    it("prefills a foreign visitor (passport, Paraguay) too, only the legacy questions", () => {
      authState.user = {
        cpf: null,
        foreignDocument: "AB123456",
        isForeigner: true,
        address: "Av. Mariscal López 1234, Asunción",
        occupation: "Investigador",
        partnerCompany: "Instituto",
        areaOfActivity: "Salud",
      };
      renderDialog({ ...legacyEvent, registrationForm: [...legacyForm, cargo] });

      expect(screen.getByLabelText(/Cargo que ocupa/)).toHaveValue("Investigador");
      expect(screen.getByLabelText(/^Cargo(\s*\*)?$/)).toHaveValue("");
    });

    it("does not prefill an archived legacy question", () => {
      authState.user = { ...newAccount, occupation: "Médica" };
      renderDialog({ ...legacyEvent, registrationForm: legacyForm.map((f) => ({ ...f, archived: true })) });

      expect(screen.queryByLabelText(/Cargo que ocupa/)).not.toBeInTheDocument();
    });
  });

  it("does not re-ask an account that already has a passport and an address", () => {
    authState.user = {
      cpf: null,
      foreignDocument: "AB123456",
      isForeigner: true,
      address: "Av. Mariscal López 1234, Asunción",
    };
    renderDialog(paidInPerson);

    expect(screen.queryByLabelText("Passaporte / Passport")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Endereço")).not.toBeInTheDocument();
  });

  it("blocks a blank required question with an inline error", async () => {
    const fetchMock = mockIdentity();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onConfirm } = renderDialog(freeOnline);

    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByLabelText(/Cargo/)).toHaveAccessibleDescription(
      "Responda a pergunta obrigatória: Cargo",
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("prefills the address the server asked for so it can be corrected", () => {
    authState.user = { ...newAccount, cpf: "123.456.789-09", address: "Rua A" };
    renderDialog(paidInPerson, { missing: ["address"] });

    expect(screen.getByLabelText("Endereço")).toHaveValue("Rua A");
  });

  it("asks the document the server reports missing while the dialog is open", () => {
    authState.user = { ...newAccount, address: "Rua A, 100, São Paulo" };
    const { rerender } = renderDialog(freeOnline);
    expect(screen.queryByLabelText("CPF")).not.toBeInTheDocument();

    rerender({ missing: ["document"] });

    expect(screen.getByLabelText("CPF")).toBeInTheDocument();
  });

  it("keeps what was typed when the server asks for more while open", async () => {
    authState.user = { ...newAccount, cpf: "123.456.789-09" };
    const user = userEvent.setup();
    const { rerender } = renderDialog(paidInPerson);

    await user.type(screen.getByLabelText("Endereço"), "Rua B, 200, Recife");
    await user.type(screen.getByLabelText(/Cargo/), "Farmacêutica");
    rerender({ missing: ["document"] });

    expect({
      asksCpf: screen.queryByLabelText("CPF") !== null,
      address: (screen.getByLabelText("Endereço") as HTMLInputElement).value,
      cargo: (screen.getByLabelText(/Cargo/) as HTMLInputElement).value,
    }).toEqual({ asksCpf: true, address: "Rua B, 200, Recife", cargo: "Farmacêutica" });
  });

  it("keeps what was typed when the dialog is reopened", async () => {
    const user = userEvent.setup();
    const { rerender } = renderDialog(freeOnline);

    await user.type(screen.getByLabelText(/Cargo/), "Farmacêutica");
    rerender({ open: false });
    rerender({ open: true });

    expect(screen.getByLabelText(/Cargo/)).toHaveValue("Farmacêutica");
  });

  it("keeps a foreign visitor's passport draft when the dialog is reopened", async () => {
    const user = userEvent.setup();
    const { rerender } = renderDialog(paidOnline);

    await user.click(screen.getByLabelText("Sou estrangeiro / I'm a foreign visitor"));
    await user.type(screen.getByLabelText("Passaporte / Passport"), "ab123456");
    rerender({ open: false });
    rerender({ open: true });

    expect(screen.getByLabelText("Passaporte / Passport")).toHaveValue("AB123456");
  });

  it("keeps the dialog open, with Cancelar disabled, while the identity is saving", async () => {
    const put = deferred<Reply>();
    vi.stubGlobal("fetch", mockIdentity(put.promise));
    const user = userEvent.setup();
    const { onCancel } = renderDialog(paidOnline);

    await user.type(screen.getByLabelText("CPF"), "12345678909");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled());
    await user.keyboard("{Escape}");

    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => put.resolve({ status: 200, body: {} }));
  });

  it("never confirms once the dialog was closed during the save", async () => {
    const put = deferred<Reply>();
    const fetchMock = mockIdentity(put.promise);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onConfirm, rerender } = renderDialog(paidOnline);

    await user.type(screen.getByLabelText("CPF"), "12345678909");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(identityBodies(fetchMock)).toHaveLength(1));
    rerender({ open: false });
    await act(async () => {
      put.resolve({ status: 200, body: {} });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows the caller's error inline", () => {
    renderDialog(freeOnline, { error: "Escolha uma das opções da pergunta: Área" });
    expect(screen.getByRole("alert")).toHaveTextContent("Escolha uma das opções da pergunta: Área");
  });
});
