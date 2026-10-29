import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Event } from "@shared/schema";

const LOGGED_IN = { isForeigner: false, cpf: "52998224725", email: "maria@example.com" };
const authState: {
  user: { isForeigner: boolean; cpf?: string | null; email?: string } | undefined;
  isLoading?: boolean;
} = {
  user: LOGGED_IN,
};
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.user, isLoading: authState.isLoading, isAuthenticated: authState.user != null }),
}));
vi.mock("../../hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const setLocation = vi.fn();
vi.mock("wouter", () => ({ useLocation: () => ["/", setLocation] }));

vi.mock("../../components/TurnstileWidget", async () => {
  const React = await import("react");
  return {
    isTurnstileConfigured: () => true,
    TurnstileWidget: React.forwardRef(function Widget(
      { onToken }: { onToken: (t: string | null) => void },
      ref: React.ForwardedRef<{ reset: () => void }>,
    ) {
      React.useImperativeHandle(ref, () => ({ reset: () => onToken(null) }));
      return (
        <button type="button" data-testid="solve-turnstile" onClick={() => onToken("tok-free")}>
          resolver
        </button>
      );
    }),
  };
});

import { useFreeSubscribe } from "../../hooks/useFreeSubscribe";
import { queryClient as appQueryClient } from "../../lib/queryClient";

const event = {
  id: "55555555-5555-5555-5555-555555555555",
  title: "Workshop",
  isFree: true,
  modality: "online",
  registrationForm: [],
} as unknown as Event;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

async function subscribeWith400(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status: 400, headers: { "Content-Type": "application/json" } })),
  );
  const invalidate = vi.spyOn(appQueryClient, "invalidateQueries").mockResolvedValue();
  const { result } = renderHook(() => useFreeSubscribe(), { wrapper });
  act(() => result.current.subscribe(event));
  await waitFor(() => expect(invalidate).toHaveBeenCalled());
  return invalidate.mock.calls.map(([filters]) => (filters as { queryKey: unknown[] }).queryKey);
}

describe("useFreeSubscribe — stale cached event", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refetches the event and the account on identity_required", async () => {
    const keys = await subscribeWith400({ code: "identity_required", missing: ["address"], message: "Complete seus dados" });

    expect(keys).toContainEqual([`/api/events/${event.id}`]);
    expect(keys).toContainEqual(["/api/auth/me"]);
  });

  it("refetches the event when the answers target an archived or unknown question", async () => {
    const keys = await subscribeWith400({ message: "Resposta para uma pergunta que não existe neste evento." });

    expect(keys).toContainEqual([`/api/events/${event.id}`]);
    expect(keys).not.toContainEqual(["/api/auth/me"]);
  });
});

describe("useFreeSubscribe — list page with a form the admin changed", () => {
  const oldQuestion = { id: "q-old", type: "text", label: "Pergunta antiga", options: [], required: false, archived: false };
  const newQuestion = { id: "q-new", type: "text", label: "Pergunta nova", options: [], required: false, archived: false };
  const listEvent = { ...event, registrationForm: [oldQuestion] } as unknown as Event;
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    appQueryClient.clear();
  });

  /** HomePage in miniature: a list consumer plus the subscribe hook's dialog. */
  function Harness() {
    const { subscribe, registrationDialog, isPending } = useFreeSubscribe();
    useQuery<Event[]>({ queryKey: ["/api/events"] });
    return (
      <>
        <button onClick={() => subscribe(listEvent)}>abrir</button>
        <span data-testid="pending">{String(isPending)}</span>
        {registrationDialog}
      </>
    );
  }

  function mount() {
    render(
      <QueryClientProvider client={appQueryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  }

  async function openAndConfirm() {
    const user = userEvent.setup();
    await user.click(screen.getByText("abrir"));
    expect(await screen.findByLabelText("Pergunta antiga")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar inscrição" }));
  }

  const refused = () => json(400, { message: "Resposta para uma pergunta que não existe neste evento." });

  it("refetches the list a second time and shows the new question in the open dialog", async () => {
    const listFetches: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/subscribe") && init?.method === "POST") return refused();
        if (url === "/api/events") {
          listFetches.push(url);
          return json(200, [{ ...event, registrationForm: listFetches.length > 1 ? [newQuestion] : [oldQuestion] }]);
        }
        return json(200, { ...event, registrationForm: [newQuestion] });
      }),
    );
    mount();
    await waitFor(() => expect(listFetches).toHaveLength(1));

    await openAndConfirm();

    expect(await screen.findByLabelText("Pergunta nova")).toBeInTheDocument();
    expect(screen.queryByLabelText("Pergunta antiga")).not.toBeInTheDocument();
    expect(listFetches).toHaveLength(2);
  });

  it("settles the request and shows the error before the event refetch answers", async () => {
    let releaseRefetch: () => void = () => {};
    const gate = new Promise<void>((resolve) => (releaseRefetch = resolve));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/subscribe") && init?.method === "POST") return refused();
        if (url === "/api/events") return json(200, [listEvent]);
        await gate;
        return json(200, { ...event, registrationForm: [newQuestion] });
      }),
    );
    mount();

    await openAndConfirm();

    expect(await screen.findByText(/não existe neste evento/)).toBeInTheDocument();
    expect(screen.getByTestId("pending")).toHaveTextContent("false");
    expect(screen.getByRole("button", { name: "Confirmar inscrição" })).toBeEnabled();
    releaseRefetch();
    expect(await screen.findByLabelText("Pergunta nova")).toBeInTheDocument();
  });

  it("tells the user to reload when the event cannot be refetched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/subscribe") && init?.method === "POST") return refused();
        if (url === "/api/events") return json(200, [listEvent]);
        return json(404, { message: "Evento não encontrado" });
      }),
    );
    mount();

    await openAndConfirm();

    expect(await screen.findByText("Atualize a página para continuar.")).toBeInTheDocument();
    expect(screen.queryByText(/não existe neste evento/)).not.toBeInTheDocument();
  });
});


describe("useFreeSubscribe — guest (no session)", () => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const subscribeUrl = `/api/events/${event.id}/subscribe`;

  function Harness({ target = event }: { target?: Event }) {
    const { subscribe, registrationDialog } = useFreeSubscribe();
    return (
      <>
        <button onClick={() => subscribe(target)}>abrir</button>
        {registrationDialog}
      </>
    );
  }

  function mount(target?: Event) {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Harness target={target} />
      </QueryClientProvider>,
    );
  }

  async function fillContact(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByTestId("input-guest-name"), "Camila Souza");
    await user.type(screen.getByTestId("input-guest-email"), "camila@example.com");
    await user.click(screen.getByTestId("input-guest-phone"));
    await user.keyboard("{End}");
    await user.type(screen.getByTestId("input-guest-phone"), "11987654321");
  }

  function subscribeCalls(fetchMock: ReturnType<typeof vi.fn>) {
    return fetchMock.mock.calls
      .filter(([url, init]) => url === subscribeUrl && (init as RequestInit).method === "POST")
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
  }

  beforeEach(() => {
    authState.user = undefined;
    setLocation.mockReset();
  });
  afterEach(() => {
    authState.user = LOGGED_IN;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens the guest dialog instead of sending a logged-out visitor to /login", async () => {
    mount();
    await userEvent.setup().click(screen.getByText("abrir"));
    expect(await screen.findByTestId("input-guest-email")).toBeInTheDocument();
    expect(setLocation).not.toHaveBeenCalled();
  });

  it("POSTs answers, buyer and the Turnstile token, then shows the success screen without going to /profile", async () => {
    const fetchMock = vi.fn(async () => json(201, { message: "Inscrição confirmada!", whatsappGroupUrl: null }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(appQueryClient, "invalidateQueries").mockResolvedValue();
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByText("abrir"));
    await fillContact(user);
    await user.click(screen.getByTestId("solve-turnstile"));
    await user.click(screen.getByRole("button", { name: "Confirmar inscrição" }));

    expect(await screen.findByRole("heading", { name: "Inscrição confirmada!" })).toBeInTheDocument();
    const [body] = subscribeCalls(fetchMock);
    expect(body).toMatchObject({
      answers: {},
      turnstileToken: "tok-free",
      buyer: { name: "Camila Souza", email: "camila@example.com" },
    });
    expect(body.buyer.phone).toMatch(/^\d{8,15}$/);
    expect(screen.getByText(/Ingresso enviado para ca•••••@ex•••\.com/)).toBeInTheDocument();
    expect(setLocation).not.toHaveBeenCalledWith("/profile");

    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("heading", { name: "Inscrição confirmada!" })).not.toBeInTheDocument();
    expect(setLocation).not.toHaveBeenCalled();
  });

  it("keeps the event's WhatsApp group on the guest success screen as a link, without opening it", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(201, { message: "Inscrição confirmada!", whatsappGroupUrl: "https://chat.whatsapp.com/AbCdEf123" })),
    );
    vi.spyOn(appQueryClient, "invalidateQueries").mockResolvedValue();
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByText("abrir"));
    await fillContact(user);
    await user.click(screen.getByTestId("solve-turnstile"));
    await user.click(screen.getByRole("button", { name: "Confirmar inscrição" }));

    await screen.findByRole("heading", { name: "Inscrição confirmada!" });
    expect(screen.getByRole("link", { name: "Entrar no grupo do WhatsApp" })).toHaveAttribute(
      "href",
      "https://chat.whatsapp.com/AbCdEf123",
    );
    expect(open).not.toHaveBeenCalled();
    expect(setLocation).not.toHaveBeenCalledWith("/profile");
  });

  it("reopens prefilled with the server message and both links on identity_conflict", async () => {
    const message = "Estes dados não conferem com um cadastro existente. Entre na sua conta ou use “Esqueci meu e-mail”.";
    vi.stubGlobal("fetch", vi.fn(async () => json(409, { code: "identity_conflict", message })));
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByText("abrir"));
    await fillContact(user);
    await user.click(screen.getByTestId("solve-turnstile"));
    await user.click(screen.getByRole("button", { name: "Confirmar inscrição" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Esqueci meu e-mail" })).toHaveAttribute("href", "/forgot-email");
    expect(screen.getByRole("link", { name: "Entrar" })).toBeInTheDocument();
    expect((screen.getByTestId("input-guest-email") as HTMLInputElement).value).toBe("camila@example.com");
  });

  it("asks the in-person document and address of a guest and sends them in the buyer", async () => {
    const inPerson = { ...event, modality: "presencial" } as unknown as Event;
    const fetchMock = vi.fn(async () => json(201, { message: "Inscrição confirmada!" }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(appQueryClient, "invalidateQueries").mockResolvedValue();
    const user = userEvent.setup();
    mount(inPerson);
    await user.click(screen.getByText("abrir"));
    await fillContact(user);
    await user.type(screen.getByLabelText("CPF"), "52998224725");
    await user.type(screen.getByLabelText("Endereço"), "Rua das Flores 10, Recife, Brasil");
    await user.click(screen.getByTestId("solve-turnstile"));
    await user.click(screen.getByRole("button", { name: "Confirmar inscrição" }));
    await screen.findByRole("heading", { name: "Inscrição confirmada!" });
    expect(subscribeCalls(fetchMock)[0].buyer).toMatchObject({
      cpf: "529.982.247-25",
      address: "Rua das Flores 10, Recife, Brasil",
    });
  });

  it("keeps the logged-in success path: toast and /profile, no success screen", async () => {
    authState.user = LOGGED_IN;
    vi.stubGlobal("fetch", vi.fn(async () => json(201, { message: "Inscrição confirmada!" })));
    vi.spyOn(appQueryClient, "invalidateQueries").mockResolvedValue();
    mount();
    await userEvent.setup().click(screen.getByText("abrir"));
    await waitFor(() => expect(setLocation).toHaveBeenCalledWith("/profile"));
    expect(screen.queryByTestId("checkout-success")).not.toBeInTheDocument();
  });
});


describe("useFreeSubscribe — N2: auth still resolving", () => {
  function Harness() {
    const { subscribe, registrationDialog } = useFreeSubscribe();
    return (
      <>
        <button onClick={() => subscribe(event)}>abrir</button>
        {registrationDialog}
      </>
    );
  }
  const mount = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Harness />
      </QueryClientProvider>,
    );

  afterEach(() => {
    authState.user = LOGGED_IN;
    authState.isLoading = undefined;
    localStorage.clear();
  });

  it("token + loading: subscribe opens no guest dialog and sends nothing", async () => {
    localStorage.setItem("token", "t");
    authState.user = undefined;
    authState.isLoading = true;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await userEvent.setup().click(screen.getByText("abrir"));
    expect(screen.queryByTestId("input-guest-email")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no token + loading: the guest dialog opens", async () => {
    authState.user = undefined;
    authState.isLoading = true;
    mount();
    await userEvent.setup().click(screen.getByText("abrir"));
    expect(await screen.findByTestId("input-guest-email")).toBeInTheDocument();
  });
});
