import { describe, it, expect, vi, afterEach, beforeEach, type MockInstance } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Event } from "@shared/schema";
import type { GuestBuyer } from "../../lib/guestBuyer";

const authState: {
  user: { isForeigner: boolean; email?: string; name?: string; cpf?: string | null } | undefined;
} = { user: undefined };
// Guest = no authenticated user, the same test the pages use.
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.user, isAuthenticated: authState.user !== undefined }),
}));

const toastSpy = vi.fn();
vi.mock("../../hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

const setLocation = vi.fn();
vi.mock("wouter", () => ({ useLocation: () => ["/", setLocation] }));

import PaymentModal from "../../components/PaymentModal";
import { queryClient as appQueryClient } from "../../lib/queryClient";
import { cardChargeLockFor, dropGuestAccessTokens, resetCardChargeLocks } from "../../lib/cardChargeLock";

// The card-charge lock lives in module scope: no test may inherit another test's lock.
afterEach(() => resetCardChargeLocks());

const event = {
  id: "44444444-4444-4444-4444-444444444444",
  title: "Congresso CDPI 2026",
  date: "2026-11-03T12:00:00.000Z",
  location: "São Paulo",
  price: "100.00",
  isFree: false,
  modality: "presencial",
  registrationForm: [],
} as unknown as Event;

function mockOrders(response: { status: number; body: unknown }) {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function orderBodies(fetchMock: ReturnType<typeof mockOrders>): unknown[] {
  return fetchMock.mock.calls
    .filter(([url]) => url === "/api/orders")
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

function renderModal(
  onIdentityRequired = vi.fn(),
  extra: { buyer?: import("../../lib/guestBuyer").GuestBuyer; onIdentityConflict?: (m: string) => void } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PaymentModal
        isOpen
        onClose={() => {}}
        event={event}
        promoCode={null}
        displayPrice={100}
        answers={{ "q-cargo": "Farmacêutica" }}
        onIdentityRequired={onIdentityRequired}
        onSuccess={() => {}}
        {...extra}
      />
    </QueryClientProvider>,
  );
  return { onIdentityRequired };
}

describe("PaymentModal — registration answers", () => {
  afterEach(() => {
    authState.user = undefined;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("sends the answers with the order", async () => {
    authState.user = { isForeigner: false };
    const fetchMock = mockOrders({ status: 201, body: { payment: { pixQrCode: "x" } } });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByTestId("button-confirm-payment"));

    await waitFor(() => {
      expect(orderBodies(fetchMock)).toEqual([
        {
          eventId: event.id,
          paymentMethod: "pix",
          promoCode: null,
          answers: { "q-cargo": "Farmacêutica" },
        },
      ]);
    });
  });

  it("pays a foreign visitor's order by card, with the answers", async () => {
    authState.user = { isForeigner: true };
    vi.stubGlobal("open", vi.fn());
    const fetchMock = mockOrders({ status: 201, body: { payment: { link: "https://pay" } } });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("button", { name: "Pagar com Cartão" }));

    await waitFor(() => {
      expect(orderBodies(fetchMock)).toEqual([
        {
          eventId: event.id,
          paymentMethod: "credit_card",
          promoCode: null,
          answers: { "q-cargo": "Farmacêutica" },
        },
      ]);
    });
  });

  it("hands identity_required back to the page instead of failing", async () => {
    authState.user = { isForeigner: false };
    vi.stubGlobal(
      "fetch",
      mockOrders({
        status: 400,
        body: { code: "identity_required", missing: ["document"], message: "Complete seus dados" },
      }),
    );
    const user = userEvent.setup();
    const { onIdentityRequired } = renderModal();

    await user.click(screen.getByTestId("button-confirm-payment"));

    await waitFor(() =>
      expect(onIdentityRequired).toHaveBeenCalledWith(["document"], "Complete seus dados"),
    );
  });

  it("shows the server's message, not the raw response, for other errors", async () => {
    authState.user = { isForeigner: false };
    vi.stubGlobal(
      "fetch",
      mockOrders({ status: 400, body: { message: "Responda a pergunta obrigatória: Cargo" } }),
    );
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByTestId("button-confirm-payment"));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Responda a pergunta obrigatória: Cargo" }),
      );
    });
  });
  it("shows a foreign buyer the card-unavailable message when Asaas refuses foreign payers", async () => {
    authState.user = { isForeigner: true };
    const unavailable = "Pagamento com cartão internacional indisponível no momento; seu pedido não foi criado.";
    vi.stubGlobal(
      "fetch",
      mockOrders({ status: 503, body: { code: "foreign_payment_unavailable", message: unavailable } }),
    );
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("button", { name: "Pagar com Cartão" }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ description: unavailable }));
    });
  });

  describe("stale cached event after an admin edited the form", () => {
    async function pay(body: unknown) {
      authState.user = { isForeigner: false };
      vi.stubGlobal("fetch", mockOrders({ status: 400, body }));
      const invalidate = vi.spyOn(appQueryClient, "invalidateQueries").mockResolvedValue();
      const user = userEvent.setup();
      renderModal();
      await user.click(screen.getByTestId("button-confirm-payment"));
      await waitFor(() => expect(invalidate).toHaveBeenCalled());
      return invalidate.mock.calls.map(([filters]) => (filters as { queryKey: unknown[] }).queryKey);
    }

    it("refetches the event and the account on identity_required", async () => {
      const keys = await pay({ code: "identity_required", missing: ["document"], message: "Complete seus dados" });

      expect(keys).toContainEqual([`/api/events/${event.id}`]);
      expect(keys).toContainEqual(["/api/auth/me"]);
    });

    it("hands the refetched event back with identity_required, not the captured one", async () => {
      authState.user = { isForeigner: false };
      const fresh = { ...event, title: "Congresso (formulário novo)", registrationForm: [{ id: "q-new", type: "text", label: "Nova", options: [], required: false, archived: false }] };
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          const json = (status: number, body: unknown) =>
            new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
          if (url === "/api/orders") {
            return json(400, { code: "identity_required", missing: ["document"], message: "Complete seus dados" });
          }
          return json(200, fresh);
        }),
      );
      const user = userEvent.setup();
      const { onIdentityRequired } = renderModal();

      await user.click(screen.getByTestId("button-confirm-payment"));

      await waitFor(() =>
        expect(onIdentityRequired).toHaveBeenCalledWith(["document"], "Complete seus dados", fresh),
      );
    });

    it("refetches the event when an answer targets an archived or unknown question", async () => {
      const keys = await pay({ message: "Resposta para uma pergunta que não existe neste evento." });

      expect(keys).toContainEqual([`/api/events/${event.id}`]);
      expect(keys).not.toContainEqual(["/api/auth/me"]);
    });

    it("refetches the event when a newly required question is missing", async () => {
      const keys = await pay({ message: "Responda a pergunta obrigatória: Turno" });

      expect(keys).toContainEqual([`/api/events/${event.id}`]);
    });
  });
});


describe("PaymentModal — guest buyer", () => {
  const buyer = { name: "Camila Souza", email: "camila@example.com", phone: "5511987654321", cpf: "529.982.247-25" };

  afterEach(() => {
    authState.user = undefined;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("sends the buyer with the order", async () => {
    const fetchMock = mockOrders({ status: 201, body: { payment: { pixQrCode: "x" } } });
    vi.stubGlobal("fetch", fetchMock);
    renderModal(vi.fn(), { buyer });
    await userEvent.setup().click(screen.getByTestId("button-confirm-payment"));
    await waitFor(() => {
      expect(orderBodies(fetchMock)).toEqual([
        { eventId: event.id, paymentMethod: "pix", promoCode: null, answers: { "q-cargo": "Farmacêutica" }, buyer },
      ]);
    });
  });

  it("sends no buyer key for a logged-in order", async () => {
    authState.user = { isForeigner: false };
    const fetchMock = mockOrders({ status: 201, body: { payment: { pixQrCode: "x" } } });
    vi.stubGlobal("fetch", fetchMock);
    renderModal();
    await userEvent.setup().click(screen.getByTestId("button-confirm-payment"));
    await waitFor(() => expect(orderBodies(fetchMock)).toHaveLength(1));
    expect("buyer" in (orderBodies(fetchMock)[0] as object)).toBe(false);
  });

  it("hands a 409 identity_conflict back to the page with the server message", async () => {
    const message = "Estes dados não conferem com um cadastro existente.";
    vi.stubGlobal("fetch", mockOrders({ status: 409, body: { code: "identity_conflict", message } }));
    const onIdentityConflict = vi.fn();
    renderModal(vi.fn(), { buyer, onIdentityConflict });
    await userEvent.setup().click(screen.getByTestId("button-confirm-payment"));
    await waitFor(() => expect(onIdentityConflict).toHaveBeenCalledWith(message));
    expect(toastSpy).not.toHaveBeenCalled();
  });
});

describe("PaymentModal — inline card, Turnstile, statuses and polling", () => {
  const PAN = "4111111111111111";
  const CVV = "739";
  const ORDER_ID = "55555555-5555-5555-5555-555555555555";
  const ANSWERS = { "q-cargo": "Farmacêutica" };
  const UNCONFIRMED =
    "Não conseguimos confirmar seu pagamento agora. Não pague de novo: se a cobrança for aprovada, você recebe o ingresso por e-mail.";
  const DECLINED = "Pagamento não aprovado. Confira os dados do cartão ou use outro cartão.";
  const BOT = "Não foi possível confirmar que você não é um robô. Recarregue a página e tente novamente.";
  const EMAIL_LATER = "Você recebe o ingresso por e-mail quando o pagamento for confirmado.";
  const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  /** toHaveTextContent collapses the element's no-break space after "R$", not the expected string's. */
  const brlText = (value: number) => brl(value).replace(/\u00a0/g, " ");
  const account = { isForeigner: false, name: "Camila Souza", cpf: "529.982.247-25", email: "camila@example.com" };
  const guest: GuestBuyer = { name: "Camila Souza", email: "camila@example.com", phone: "5511987654321", cpf: "529.982.247-25" };
  const cardPart = (installmentCount = 1) => ({
    card: { holderName: "CAMILA SOUZA", number: PAN, expiryMonth: "12", expiryYear: "2035", ccv: CVV },
    cardHolder: { name: "Camila Souza", cpf: "52998224725", postalCode: "01310100", addressNumber: "100" },
    installmentCount,
  });
  const paidBody = {
    order: { id: ORDER_ID, status: "paid", amount: "105.00" },
    payment: { id: "pay_1", status: "CONFIRMED", value: 105, installmentCount: 1 },
  };
  const unconfirmedBody = {
    code: "payment_pending_confirmation",
    message: UNCONFIRMED,
    order: { id: ORDER_ID },
    orderAccessToken: "ord-tok",
  };

  type Reply = { status: number; body?: unknown; html?: string } | "network";
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  /** Answers /api/orders and check-status from queues; the last reply of a queue repeats. */
  function serve(replies: { orders?: Reply[]; checkStatus?: Reply[] }) {
    const queues = { orders: [...(replies.orders ?? [])], checkStatus: [...(replies.checkStatus ?? [])] };
    return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      const queue = url === "/api/orders" ? queues.orders : url.endsWith("/check-status") ? queues.checkStatus : [];
      const reply = queue.length > 1 ? queue.shift() : queue[0];
      if (reply === undefined) return json(404, { message: "Não encontrado" });
      if (reply === "network") throw new TypeError("Failed to fetch");
      if (reply.html !== undefined) {
        return new Response(reply.html, { status: reply.status, headers: { "Content-Type": "text/html" } });
      }
      return json(reply.status, reply.body);
    });
  }
  type FetchMock = ReturnType<typeof serve>;
  const orderCalls = (f: FetchMock) => f.mock.calls.filter(([url]) => String(url) === "/api/orders");
  const statusCalls = (f: FetchMock) => f.mock.calls.filter(([url]) => String(url).endsWith("/check-status"));
  const sentBody = (f: FetchMock, index = 0) => JSON.parse(String(orderCalls(f)[index][1]!.body));

  function setup(opts: { buyer?: GuestBuyer } = {}) {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const onIdentityConflict = vi.fn();
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const ui = (isOpen: boolean, forEvent: Event = event) => (
      <QueryClientProvider client={client}>
        <PaymentModal
          isOpen={isOpen}
          onClose={onClose}
          event={forEvent}
          promoCode={null}
          displayPrice={100}
          answers={ANSWERS}
          onIdentityRequired={vi.fn()}
          onIdentityConflict={onIdentityConflict}
          onSuccess={onSuccess}
          buyer={opts.buyer}
        />
      </QueryClientProvider>
    );
    let view = render(ui(true));
    return {
      user: userEvent.setup({ advanceTimers: vi.advanceTimersByTime }),
      onClose,
      onSuccess,
      onIdentityConflict,
      client,
      /** The event page path: the modal stays mounted and toggles `isOpen`. */
      close: () => view.rerender(ui(false)),
      reopen: () => view.rerender(ui(true)),
      /** The home page path (and a route change): the modal unmounts, and the next "Comprar" mounts a new one. */
      remount: (forEvent: Event = event) => {
        view.unmount();
        view = render(ui(true, forEvent));
      },
    };
  }

  async function fillCard(
    user: UserEvent,
    over: Partial<Record<"number" | "holderName" | "expiry" | "ccv" | "postalCode" | "addressNumber", string>> = {},
  ) {
    const v = {
      number: "4111 1111 1111 1111",
      holderName: "CAMILA SOUZA",
      expiry: "12/35",
      ccv: CVV,
      postalCode: "01310-100",
      addressNumber: "100",
      ...over,
    };
    await user.click(screen.getByRole("tab", { name: /Cartão/ }));
    const fields: Record<string, string> = {
      "input-card-number": v.number,
      "input-card-holder-name": v.holderName,
      "input-card-expiry": v.expiry,
      "input-card-ccv": v.ccv,
      "input-card-postal-code": v.postalCode,
      "input-card-address-number": v.addressNumber,
    };
    for (const [testId, value] of Object.entries(fields)) {
      const input = screen.getByTestId(testId);
      await user.clear(input);
      if (value) await user.type(input, value);
    }
  }

  const submit = () => screen.getByTestId("button-confirm-payment");
  const pay = (user: UserEvent) => user.click(submit());
  /** One polling interval. */
  const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(5_000); });

  function stubTurnstile() {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site-key");
    const callbacks: Array<(token: string) => void> = [];
    const api = {
      render: vi.fn((_el: HTMLElement, options: { callback: (token: string) => void }) => {
        callbacks.push(options.callback);
        return "widget-1";
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    };
    (window as unknown as { turnstile: typeof api }).turnstile = api;
    return {
      api,
      async solve(token: string) {
        await vi.waitFor(() => expect(api.render).toHaveBeenCalled());
        act(() => callbacks[callbacks.length - 1](token));
      },
    };
  }

  // PCI: no card number or CVV in any console call, toast, storage or the URL.
  const consoleSpies: MockInstance[] = [];
  function dump(value: unknown): string {
    if (value instanceof Error) return `${value.message}\n${value.stack ?? ""}`;
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  }
  function expectNoCardDataLeaked() {
    const seen = [...consoleSpies.flatMap((spy) => spy.mock.calls), ...toastSpy.mock.calls].flat().map(dump).join("\n");
    expect(seen).not.toContain(PAN);
    expect(seen).not.toMatch(/4111[\s-]1111/);
    expect(seen).not.toMatch(/(^|[^:\d])739(?!\d)/);
    let stored = window.location.href;
    for (const storage of [localStorage, sessionStorage]) {
      for (let i = 0; i < storage.length; i++) stored += storage.getItem(storage.key(i)!) ?? "";
    }
    expect(stored).not.toContain(PAN);
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    for (const method of ["log", "info", "warn", "error", "debug"] as const) consoleSpies.push(vi.spyOn(console, method));
  });
  afterEach(() => {
    expectNoCardDataLeaked();
    consoleSpies.splice(0).forEach((spy) => spy.mockRestore());
    vi.useRealTimers();
    authState.user = undefined;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    delete (window as unknown as { turnstile?: unknown }).turnstile;
  });

  describe("card form", () => {
    it("renders autofill hints, a grouped number, masks and installment labels from the total", async () => {
      authState.user = account;
      vi.stubGlobal("fetch", serve({}));
      const { user } = setup();
      await user.click(screen.getByRole("tab", { name: /Cartão/ }));

      const number = screen.getByTestId("input-card-number");
      expect(number).toHaveAttribute("autocomplete", "cc-number");
      expect(number).toHaveAttribute("inputmode", "numeric");
      expect(screen.getByTestId("input-card-holder-name")).toHaveAttribute("autocomplete", "cc-name");
      expect(screen.getByTestId("input-card-expiry")).toHaveAttribute("autocomplete", "cc-exp");
      expect(screen.getByTestId("input-card-ccv")).toHaveAttribute("autocomplete", "cc-csc");
      await user.type(number, PAN);
      expect(number).toHaveValue("4111 1111 1111 1111");
      await user.type(screen.getByTestId("input-card-expiry"), "1235");
      expect(screen.getByTestId("input-card-expiry")).toHaveValue("12/35");
      await user.type(screen.getByTestId("input-card-postal-code"), "01310100");
      expect(screen.getByTestId("input-card-postal-code")).toHaveValue("01310-100");
      expect(screen.getByRole("radio", { name: `1x de ${brl(105)}` })).toBeChecked();
      expect(screen.getByRole("radio", { name: `2x de ${brl(52.5)}` })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: `3x de ${brl(35)}` })).toBeInTheDocument();
      expect(screen.queryByText(/link de pagamento abre em uma nova aba/)).toBeNull();
    });

    it("sends the exact card body: strings for the card, a number for installmentCount", async () => {
      authState.user = account;
      const f = serve({ orders: [{ status: 201, body: paidBody }] });
      vi.stubGlobal("fetch", f);
      const { user } = setup();
      await fillCard(user);
      await user.click(screen.getByRole("radio", { name: `2x de ${brl(52.5)}` }));
      await pay(user);

      await waitFor(() => expect(orderCalls(f)).toHaveLength(1));
      const body = sentBody(f);
      expect(body).toEqual({
        eventId: event.id,
        paymentMethod: "credit_card",
        promoCode: null,
        answers: ANSWERS,
        ...cardPart(2),
      });
      expect(typeof body.installmentCount).toBe("number");
      expect(typeof body.card.ccv).toBe("string");
    });

    it("defaults a guest's card holder to the buyer and sends buyer + Turnstile token", async () => {
      const turnstile = stubTurnstile();
      const f = serve({ orders: [{ status: 201, body: { ...paidBody, orderAccessToken: "ord-tok" } }] });
      vi.stubGlobal("fetch", f);
      const { user } = setup({ buyer: guest });
      await fillCard(user);

      expect(submit()).toBeDisabled();
      await turnstile.solve("tok-1");
      expect(submit()).toBeEnabled();
      await pay(user);

      await waitFor(() => expect(orderCalls(f)).toHaveLength(1));
      expect(sentBody(f)).toEqual({
        eventId: event.id,
        paymentMethod: "credit_card",
        promoCode: null,
        answers: ANSWERS,
        buyer: guest,
        ...cardPart(1),
        turnstileToken: "tok-1",
      });
    });

    it("sends the typed holder name and CPF with “Outro titular”", async () => {
      authState.user = account;
      const f = serve({ orders: [{ status: 201, body: paidBody }] });
      vi.stubGlobal("fetch", f);
      const { user } = setup();
      await fillCard(user);
      await user.click(screen.getByTestId("checkbox-card-other-holder"));
      await user.type(screen.getByTestId("input-card-holder-full-name"), "Marcos Lima");
      await user.type(screen.getByTestId("input-card-holder-cpf"), "39053344705");
      expect(screen.getByTestId("input-card-holder-cpf")).toHaveValue("390.533.447-05");
      await pay(user);

      await waitFor(() => expect(orderCalls(f)).toHaveLength(1));
      expect(sentBody(f).cardHolder).toEqual({
        name: "Marcos Lima",
        cpf: "39053344705",
        postalCode: "01310100",
        addressNumber: "100",
      });
    });

    it("blocks the request and shows each field's error for invalid card data", async () => {
      authState.user = account;
      const f = serve({ orders: [{ status: 201, body: paidBody }] });
      vi.stubGlobal("fetch", f);
      const { user } = setup();
      await fillCard(user, {
        number: "4111 1111 1111 1112",
        holderName: "",
        expiry: "01/20",
        ccv: "12",
        postalCode: "0131010",
        addressNumber: "",
      });
      await user.click(screen.getByTestId("checkbox-card-other-holder"));
      await user.type(screen.getByTestId("input-card-holder-cpf"), "11111111111");
      await pay(user);

      expect(screen.getByTestId("text-card-number-error")).toHaveTextContent("Número do cartão inválido.");
      expect(screen.getByTestId("text-card-holder-name-error")).toHaveTextContent("Informe o nome impresso no cartão.");
      expect(screen.getByTestId("text-card-expiry-error")).toHaveTextContent("Validade inválida ou vencida.");
      expect(screen.getByTestId("text-card-ccv-error")).toHaveTextContent("CVV inválido.");
      expect(screen.getByTestId("text-card-postal-code-error")).toHaveTextContent("CEP inválido.");
      expect(screen.getByTestId("text-card-address-number-error")).toHaveTextContent("Informe o número do endereço.");
      expect(screen.getByTestId("text-card-holder-full-name-error")).toHaveTextContent("Informe o nome completo do titular.");
      expect(screen.getByTestId("text-card-holder-cpf-error")).toHaveTextContent("CPF do titular inválido.");
      expect(orderCalls(f)).toHaveLength(0);

      await fillCard(user);
      await user.type(screen.getByTestId("input-card-holder-full-name"), "Marcos Lima");
      await user.clear(screen.getByTestId("input-card-holder-cpf"));
      await user.type(screen.getByTestId("input-card-holder-cpf"), "39053344705");
      await pay(user);
      await waitFor(() => expect(orderCalls(f)).toHaveLength(1));
    });

    it("keeps a logged-in foreign visitor on the hosted invoice (no card fields)", async () => {
      authState.user = { isForeigner: true, name: "John Smith", email: "john@example.com" };
      vi.stubGlobal("fetch", serve({}));
      setup();
      expect(screen.getByTestId("button-confirm-payment")).toHaveTextContent("Pagar com Cartão");
      expect(screen.queryByTestId("input-card-number")).toBeNull();
    });
  });

  describe("card responses", () => {
    it("201 CONFIRMED shows the success screen with order.amount, never payment.value", async () => {
      authState.user = account;
      const f = serve({
        orders: [
          {
            status: 201,
            body: {
              order: { id: ORDER_ID, status: "paid", amount: "105.00" },
              payment: { id: "pay_1", status: "CONFIRMED", value: 52.5, installmentCount: 2 },
            },
          },
        ],
      });
      vi.stubGlobal("fetch", f);
      const { user, onSuccess } = setup();
      await fillCard(user);
      await user.click(screen.getByRole("radio", { name: `2x de ${brl(52.5)}` }));
      await pay(user);

      expect(await screen.findByText("Pagamento confirmado!")).toBeInTheDocument();
      expect(screen.getByTestId("text-success-total")).toHaveTextContent(`Total: ${brlText(105)}`);
      expect(document.body.textContent).not.toContain(brl(52.5));
      expect(screen.getByTestId("text-success-email")).not.toHaveTextContent("camila@example.com");
      expect(screen.queryByTestId("input-card-number")).toBeNull();
      await tick();
      expect(statusCalls(f)).toHaveLength(0);
      await user.click(screen.getByTestId("button-success-continue"));
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it("201 under risk analysis says “Pagamento em análise”, polls the session check-status, then succeeds", async () => {
      authState.user = account;
      const f = serve({
        orders: [
          {
            status: 201,
            body: {
              order: { id: ORDER_ID, status: "pending", amount: "104.00" },
              payment: { id: "pay_1", status: "AWAITING_RISK_ANALYSIS", value: 104, installmentCount: 1 },
            },
          },
        ],
        checkStatus: [
          { status: 200, body: { message: "Status do pedido: pending", order: { id: ORDER_ID, status: "pending" }, paymentStatus: null } },
          { status: 200, body: { message: "Pagamento confirmado!", order: { id: ORDER_ID, status: "paid", amount: "104.00" } } },
        ],
      });
      vi.stubGlobal("fetch", f);
      const { user } = setup();
      await fillCard(user);
      await pay(user);

      expect(await screen.findByText("Pagamento em análise")).toBeInTheDocument();
      expect(screen.getByTestId("text-payment-total")).toHaveTextContent(brlText(104));
      expect(statusCalls(f)).toHaveLength(0);
      await tick();
      expect(statusCalls(f)).toHaveLength(1);
      const [url, init] = statusCalls(f)[0];
      expect(url).toBe(`/api/orders/${ORDER_ID}/check-status`);
      expect(init!.method).toBe("POST");
      expect(init!.headers).not.toHaveProperty("X-Order-Access");
      expect(screen.getByText("Pagamento em análise")).toBeInTheDocument();
      await tick();
      expect(await screen.findByText("Pagamento confirmado!")).toBeInTheDocument();
    });

    it("202 says “Não pague de novo” and polls with the guest's X-Order-Access token until paid", async () => {
      const f = serve({
        orders: [{ status: 202, body: unconfirmedBody }],
        checkStatus: [
          { status: 200, body: { status: "pending", paymentStatus: null } },
          { status: 200, body: { status: "paid", paymentStatus: "CONFIRMED" } },
        ],
      });
      vi.stubGlobal("fetch", f);
      const { user, onClose, onSuccess } = setup({ buyer: guest });
      await fillCard(user);
      await pay(user);

      expect(await screen.findByTestId("text-payment-unconfirmed")).toHaveTextContent(UNCONFIRMED);
      await tick();
      expect(statusCalls(f)).toHaveLength(1);
      expect(statusCalls(f)[0][1]!.headers).toMatchObject({ "X-Order-Access": "ord-tok" });
      expect(screen.queryByText("Pagamento confirmado!")).toBeNull();
      await tick();
      expect(await screen.findByText("Pagamento confirmado!")).toBeInTheDocument();
      expect(screen.getByTestId("button-success-create-password")).toBeInTheDocument();
      await user.click(screen.getByTestId("button-success-close"));
      expect(onClose).toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(setLocation).not.toHaveBeenCalledWith("/profile");
    });

    it("402 shows the server message, clears only the CVV and lets the buyer retry", async () => {
      authState.user = account;
      const f = serve({
        orders: [
          { status: 402, body: { code: "card_declined", message: DECLINED } },
          { status: 201, body: paidBody },
        ],
      });
      vi.stubGlobal("fetch", f);
      const { user, client } = setup();
      await fillCard(user);
      await pay(user);

      expect(await screen.findByTestId("text-card-error")).toHaveTextContent(DECLINED);
      expect(screen.getByTestId("input-card-ccv")).toHaveValue("");
      expect(screen.getByTestId("input-card-number")).toHaveValue("4111 1111 1111 1111");
      expect(submit()).toBeEnabled();
      await user.type(screen.getByTestId("input-card-ccv"), CVV);
      await pay(user);

      expect(await screen.findByText("Pagamento confirmado!")).toBeInTheDocument();
      expect(orderCalls(f)).toHaveLength(2);
      expect(toastSpy).not.toHaveBeenCalled();
      // Card data never lands in a react-query cache (mutation variables or query keys/data).
      for (const qc of [client, appQueryClient]) {
        const cached = JSON.stringify([
          qc.getMutationCache().getAll().map((m) => m.state.variables),
          qc.getQueryCache().getAll().map((q) => [q.queryKey, q.state.data]),
        ]);
        expect(cached).not.toContain(PAN);
      }
    });

    it.each([
      [400, "invalid_card", "Confira os dados do cartão e do titular."],
      [429, "rate_limited", "Muitas tentativas. Tente novamente em alguns minutos."],
      [502, "payment_provider_error", "Não foi possível gerar a cobrança agora. Tente novamente em alguns minutos."],
    ])("%i %s shows the server message and allows a retry", async (status, code, message) => {
      authState.user = account;
      const f = serve({ orders: [{ status, body: { code, message } }, { status: 201, body: paidBody }] });
      vi.stubGlobal("fetch", f);
      const { user } = setup();
      await fillCard(user);
      await pay(user);

      expect(await screen.findByTestId("text-card-error")).toHaveTextContent(message);
      expect(screen.getByTestId("input-card-ccv")).toHaveValue("");
      await tick();
      expect(statusCalls(f)).toHaveLength(0);
      await user.type(screen.getByTestId("input-card-ccv"), CVV);
      await pay(user);
      await waitFor(() => expect(orderCalls(f)).toHaveLength(2));
    });

    it("403 turnstile_failed shows the message, and the widget is reset after every response", async () => {
      const turnstile = stubTurnstile();
      const f = serve({
        orders: [
          { status: 403, body: { code: "turnstile_failed", message: BOT } },
          { status: 402, body: { code: "card_declined", message: DECLINED } },
          { status: 201, body: { ...paidBody, orderAccessToken: "ord-tok" } },
        ],
      });
      vi.stubGlobal("fetch", f);
      const { user } = setup({ buyer: guest });
      await fillCard(user);
      await turnstile.solve("tok-1");
      await pay(user);

      expect(await screen.findByTestId("text-card-error")).toHaveTextContent(BOT);
      expect(turnstile.api.reset).toHaveBeenCalledTimes(1);
      expect(turnstile.api.reset).toHaveBeenCalledWith("widget-1");
      expect(submit()).toBeDisabled();

      await turnstile.solve("tok-2");
      await user.type(screen.getByTestId("input-card-ccv"), CVV);
      await pay(user);
      expect(await screen.findByText(DECLINED)).toBeInTheDocument();
      expect(turnstile.api.reset).toHaveBeenCalledTimes(2);
      expect(sentBody(f, 1).turnstileToken).toBe("tok-2");

      await turnstile.solve("tok-3");
      await user.type(screen.getByTestId("input-card-ccv"), CVV);
      await pay(user);
      expect(await screen.findByText("Pagamento confirmado!")).toBeInTheDocument();
      expect(turnstile.api.reset).toHaveBeenCalledTimes(3);
    });

    it("renders the widget for a logged-in card payment but not for a logged-in PIX", async () => {
      stubTurnstile();
      authState.user = account;
      vi.stubGlobal("fetch", serve({}));
      const { user } = setup();

      expect(screen.queryByTestId("turnstile-widget")).toBeNull();
      expect(submit()).toBeEnabled();
      await user.click(screen.getByRole("tab", { name: /Cartão/ }));
      expect(screen.getByTestId("turnstile-widget")).toBeInTheDocument();
    });

    it("a non-JSON 504 is an unknown outcome: no polling, and the card submit stays locked across tabs", async () => {
      authState.user = account;
      const invalidate = vi.spyOn(appQueryClient, "invalidateQueries").mockResolvedValue();
      const f = serve({ orders: [{ status: 504, html: "<html><body><h1>504 Gateway Time-out</h1></body></html>" }] });
      vi.stubGlobal("fetch", f);
      const { user } = setup();
      await fillCard(user);
      await pay(user);

      expect(await screen.findByTestId("text-payment-unconfirmed")).toHaveTextContent(UNCONFIRMED);
      expect(submit()).toBeDisabled();
      await tick();
      await tick();
      expect(statusCalls(f)).toHaveLength(0);
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["/api/orders"] });
      expect(toastSpy).not.toHaveBeenCalled();

      await user.click(screen.getByRole("tab", { name: /PIX/ }));
      expect(submit()).toBeEnabled();
      await user.click(screen.getByRole("tab", { name: /Cartão/ }));
      expect(submit()).toBeDisabled();
      expect(orderCalls(f)).toHaveLength(1);
    });

    it("a network failure on a card submit is an unknown outcome without polling", async () => {
      const f = serve({ orders: ["network"] });
      vi.stubGlobal("fetch", f);
      const { user } = setup({ buyer: guest });
      await fillCard(user);
      await pay(user);

      expect(await screen.findByTestId("text-payment-unconfirmed")).toHaveTextContent(UNCONFIRMED);
      expect(submit()).toBeDisabled();
      await tick();
      expect(statusCalls(f)).toHaveLength(0);
    });

    it("sends one request for a double click and cannot be closed while the charge is in flight", async () => {
      authState.user = account;
      let release!: (response: Response) => void;
      const f = vi.fn((input: RequestInfo | URL, _init?: RequestInit) =>
        String(input) === "/api/orders"
          ? new Promise<Response>((resolve) => {
              release = resolve;
            })
          : Promise.resolve(json(404, {})),
      );
      vi.stubGlobal("fetch", f);
      const { user, onClose } = setup();
      await fillCard(user);

      const button = submit();
      act(() => {
        button.click();
        button.click();
      });
      expect(orderCalls(f as unknown as FetchMock)).toHaveLength(1);
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent("Processando...");
      await user.keyboard("{Escape}");
      expect(onClose).not.toHaveBeenCalled();

      await act(async () => release(json(201, paidBody)));
      expect(await screen.findByText("Pagamento confirmado!")).toBeInTheDocument();
      expect(orderCalls(f as unknown as FetchMock)).toHaveLength(1);
    });

    it("while the charge is in flight the X and the tabs are disabled, and the modal says not to close or reload", async () => {
      authState.user = account;
      let release!: (response: Response) => void;
      const f = vi.fn((input: RequestInfo | URL, _init?: RequestInit) =>
        String(input) === "/api/orders"
          ? new Promise<Response>((resolve) => {
              release = resolve;
            })
          : Promise.resolve(json(404, {})),
      );
      vi.stubGlobal("fetch", f);
      const { user, onClose } = setup();
      await fillCard(user);
      const closeX = screen.getByRole("button", { name: "Close" });
      expect(closeX).toBeEnabled();
      expect(screen.queryByTestId("text-payment-in-flight")).toBeNull();

      await pay(user);
      expect(submit()).toHaveTextContent("Processando...");
      expect(screen.getByTestId("text-payment-in-flight")).toHaveTextContent("Não feche nem recarregue esta página");
      expect(closeX).toBeDisabled();
      await user.click(closeX);
      expect(onClose).not.toHaveBeenCalled();
      for (const name of [/PIX/, /Cartão/, /Boleto/]) expect(screen.getByRole("tab", { name })).toBeDisabled();
      await user.click(screen.getByRole("tab", { name: /PIX/ }));
      expect(screen.getByRole("tab", { name: /Cartão/ })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("input-card-number")).toBeInTheDocument();

      await act(async () => release(json(402, { code: "card_declined", message: DECLINED })));
      expect(await screen.findByTestId("text-card-error")).toHaveTextContent(DECLINED);
      expect(screen.queryByTestId("text-payment-in-flight")).toBeNull();
      expect(closeX).toBeEnabled();
      expect(screen.getByRole("tab", { name: /PIX/ })).toBeEnabled();
    });

    it("hands a card identity_conflict back to the page", async () => {
      const message = "Estes dados não conferem com um cadastro existente.";
      vi.stubGlobal("fetch", serve({ orders: [{ status: 409, body: { code: "identity_conflict", message } }] }));
      const { user, onIdentityConflict } = setup({ buyer: guest });
      await fillCard(user);
      await pay(user);

      await waitFor(() => expect(onIdentityConflict).toHaveBeenCalledWith(message));
      expect(screen.queryByTestId("text-card-error")).toBeNull();
    });
  });

  describe("polling", () => {
    it("stops when the modal closes", async () => {
      const f = serve({
        orders: [{ status: 202, body: unconfirmedBody }],
        checkStatus: [{ status: 200, body: { status: "pending", paymentStatus: null } }],
      });
      vi.stubGlobal("fetch", f);
      const { user, close } = setup({ buyer: guest });
      await fillCard(user);
      await pay(user);
      await screen.findByTestId("text-payment-unconfirmed");

      await tick();
      expect(statusCalls(f)).toHaveLength(1);
      close();
      await tick();
      await tick();
      await tick();
      expect(statusCalls(f)).toHaveLength(1);
    });

    it("keeps polling through other errors and stops quietly on 404", async () => {
      const f = serve({
        orders: [{ status: 202, body: unconfirmedBody }],
        checkStatus: [
          { status: 500, body: { message: "Erro ao verificar status do pagamento" } },
          { status: 404, body: { message: "Pedido não encontrado" } },
        ],
      });
      vi.stubGlobal("fetch", f);
      const { user } = setup({ buyer: guest });
      await fillCard(user);
      await pay(user);
      await screen.findByTestId("text-payment-unconfirmed");

      await tick();
      expect(statusCalls(f)).toHaveLength(1);
      expect(screen.queryByTestId("text-payment-poll-status")).toBeNull();
      await tick();
      expect(statusCalls(f)).toHaveLength(2);
      expect(await screen.findByTestId("text-payment-poll-status")).toHaveTextContent(EMAIL_LATER);
      await tick();
      expect(statusCalls(f)).toHaveLength(2);
      expect(toastSpy).not.toHaveBeenCalled();
    });

    it("sends a guest PIX with buyer + token, polls with the token and stops on “Pagamento cancelado”", async () => {
      const turnstile = stubTurnstile();
      const f = serve({
        orders: [
          {
            status: 201,
            body: {
              order: { id: ORDER_ID, status: "pending", amount: "105.00" },
              orderAccessToken: "ord-tok",
              payment: { id: "pay_1", status: "PENDING", value: 105, pixQrCode: "x", pixPayload: "PIX-PAYLOAD" },
            },
          },
        ],
        checkStatus: [{ status: 200, body: { status: "cancelled", paymentStatus: "OVERDUE" } }],
      });
      vi.stubGlobal("fetch", f);
      const { user } = setup({ buyer: guest });

      expect(submit()).toBeDisabled();
      await turnstile.solve("tok-1");
      await pay(user);
      expect(await screen.findByText("PIX Gerado com Sucesso!")).toBeInTheDocument();
      expect(sentBody(f)).toEqual({
        eventId: event.id,
        paymentMethod: "pix",
        promoCode: null,
        answers: ANSWERS,
        buyer: guest,
        turnstileToken: "tok-1",
      });
      expect(turnstile.api.reset).toHaveBeenCalledTimes(1);

      await tick();
      expect(statusCalls(f)[0][1]!.headers).toMatchObject({ "X-Order-Access": "ord-tok" });
      expect(await screen.findByTestId("text-payment-poll-status")).toHaveTextContent("Pagamento cancelado");
      await tick();
      expect(statusCalls(f)).toHaveLength(1);
    });

    it("reads the session shape for a logged-in PIX and shows the success screen", async () => {
      authState.user = account;
      const f = serve({
        orders: [
          {
            status: 201,
            body: {
              order: { id: ORDER_ID, status: "pending", amount: "105.00" },
              payment: { id: "pay_1", status: "PENDING", value: 105, pixQrCode: "x", pixPayload: "PIX-PAYLOAD" },
            },
          },
        ],
        checkStatus: [
          { status: 200, body: { message: "Pagamento confirmado!", order: { id: ORDER_ID, status: "paid", amount: "105.00" } } },
        ],
      });
      vi.stubGlobal("fetch", f);
      const { user, onSuccess } = setup();
      await pay(user);
      expect(await screen.findByText("PIX Gerado com Sucesso!")).toBeInTheDocument();
      expect(sentBody(f)).not.toHaveProperty("turnstileToken");

      await tick();
      expect(statusCalls(f)[0][1]!.headers).not.toHaveProperty("X-Order-Access");
      expect(await screen.findByText("Pagamento confirmado!")).toBeInTheDocument();
      await user.click(screen.getByTestId("button-success-continue"));
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  // R37 amended: after an unknown or pending card outcome, no new card charge for the event until a
  // page reload, or until polling reports paid or cancelled. PIX and boleto stay usable.
  describe("card-charge lock across close, reopen and remount", () => {
    const otherEvent = { ...event, id: "66666666-6666-6666-6666-666666666666" } as unknown as Event;
    const amber = () => screen.queryByTestId("text-payment-unconfirmed");
    const cardTab = () => screen.getByRole("tab", { name: /Cartão/ });
    const answered = () => waitFor(() => expect(submit()).not.toHaveTextContent("Processando..."));

    it("a 504 survives close and reopen: empty fields, the amber alert, card submit disabled, PIX usable", async () => {
      authState.user = account;
      const f = serve({ orders: [{ status: 504, html: "<html>504</html>" }] });
      vi.stubGlobal("fetch", f);
      const { user, close, reopen } = setup();
      await fillCard(user);
      await pay(user);
      await screen.findByTestId("text-payment-unconfirmed");

      close();
      reopen();
      await user.click(cardTab());
      expect(screen.getByTestId("input-card-number")).toHaveValue("");
      expect(screen.getByTestId("input-card-ccv")).toHaveValue("");
      expect(amber()).toHaveTextContent(UNCONFIRMED);
      expect(amber()).toHaveClass("bg-amber-50");
      expect(submit()).toBeDisabled();
      await user.click(screen.getByRole("tab", { name: /PIX/ }));
      expect(submit()).toBeEnabled();
      await tick();
      expect(statusCalls(f)).toHaveLength(0);
      expect(orderCalls(f)).toHaveLength(1);
    });

    it("a 504 survives an unmount and a new mount (the home page path)", async () => {
      authState.user = account;
      const f = serve({ orders: [{ status: 504, html: "<html>504</html>" }] });
      vi.stubGlobal("fetch", f);
      const { user, remount } = setup();
      await fillCard(user);
      await pay(user);
      await screen.findByTestId("text-payment-unconfirmed");

      remount();
      expect(amber()).toHaveTextContent(UNCONFIRMED);
      await fillCard(user);
      expect(submit()).toBeDisabled();
      expect(orderCalls(f)).toHaveLength(1);
    });

    it("locks only the event charged", async () => {
      authState.user = account;
      vi.stubGlobal("fetch", serve({ orders: [{ status: 504, html: "<html>504</html>" }] }));
      const { user, remount } = setup();
      await fillCard(user);
      await pay(user);
      await screen.findByTestId("text-payment-unconfirmed");

      remount(otherEvent);
      await user.click(cardTab());
      expect(amber()).toBeNull();
      expect(submit()).toBeEnabled();
      remount();
      await user.click(cardTab());
      expect(submit()).toBeDisabled();
    });

    it("a 202 survives a new mount, which resumes polling with the guest's X-Order-Access; paid releases the lock", async () => {
      const f = serve({
        orders: [{ status: 202, body: unconfirmedBody }],
        checkStatus: [
          { status: 200, body: { status: "pending", paymentStatus: null } },
          { status: 200, body: { status: "paid", paymentStatus: "CONFIRMED" } },
        ],
      });
      vi.stubGlobal("fetch", f);
      const { user, remount } = setup({ buyer: guest });
      await fillCard(user);
      await pay(user);
      await screen.findByTestId("text-payment-unconfirmed");

      remount();
      await user.click(cardTab());
      expect(amber()).toHaveTextContent(UNCONFIRMED);
      expect(submit()).toBeDisabled();
      await tick();
      expect(statusCalls(f)).toHaveLength(1);
      const [url, init] = statusCalls(f)[0];
      expect(url).toBe(`/api/orders/${ORDER_ID}/check-status`);
      expect(init!.headers).toMatchObject({ "X-Order-Access": "ord-tok" });
      await tick();
      expect(await screen.findByText("Pagamento confirmado!")).toBeInTheDocument();
      expect(screen.getByTestId("button-success-create-password")).toBeInTheDocument();

      remount();
      await user.click(cardTab());
      expect(amber()).toBeNull();
      expect(submit()).toBeEnabled();
    });

    it("F4a: unknown outcome, polled to paid, closed and reopened: a fresh form whose submit waits only for Turnstile, then is enabled", async () => {
      const turnstile = stubTurnstile();
      const f = serve({
        orders: [{ status: 202, body: unconfirmedBody }],
        checkStatus: [{ status: 200, body: { status: "paid", paymentStatus: "CONFIRMED" } }],
      });
      vi.stubGlobal("fetch", f);
      const { user, close, reopen } = setup({ buyer: guest });
      await turnstile.solve("tok-1");
      await fillCard(user);
      await pay(user);
      await screen.findByTestId("text-payment-unconfirmed");
      await tick();
      expect(await screen.findByText("Pagamento confirmado!")).toBeInTheDocument();
      expect(cardChargeLockFor(event.id)).toBeNull();

      close();
      reopen();
      await user.click(cardTab());
      // Reopen starts over (T3 decision 3): empty form, no success screen, no lock.
      expect(screen.queryByText("Pagamento confirmado!")).toBeNull();
      expect(screen.getByTestId("input-card-number")).toHaveValue("");
      expect(amber()).toBeNull();
      // The disabled button is the new Turnstile challenge, not a stuck lock.
      expect(submit()).toBeDisabled();
      await turnstile.solve("tok-2");
      expect(submit()).toBeEnabled();
    });

    it("F4a: closed while locked, paid meanwhile: reopening polls and shows the success screen", async () => {
      authState.user = account;
      const f = serve({
        orders: [{ status: 202, body: unconfirmedBody }],
        checkStatus: [{ status: 200, body: { order: { id: ORDER_ID, status: "paid", amount: "105.00" }, paymentStatus: "CONFIRMED" } }],
      });
      vi.stubGlobal("fetch", f);
      const { user, close, reopen } = setup();
      await fillCard(user);
      await pay(user);
      await screen.findByTestId("text-payment-unconfirmed");
      close();
      await tick();
      expect(statusCalls(f)).toHaveLength(0);

      reopen();
      await tick();
      expect(await screen.findByText("Pagamento confirmado!")).toBeInTheDocument();
      expect(cardChargeLockFor(event.id)).toBeNull();
    });

    it("R2: an auth change drops the guest token, keeps the card locked, and never polls with the old token", async () => {
      const f = serve({
        orders: [{ status: 202, body: unconfirmedBody }],
        checkStatus: [{ status: 200, body: { status: "paid", paymentStatus: "CONFIRMED" } }],
      });
      vi.stubGlobal("fetch", f);
      const { user, remount } = setup({ buyer: guest });
      await fillCard(user);
      await pay(user);
      await screen.findByTestId("text-payment-unconfirmed");

      act(() => dropGuestAccessTokens());
      await tick();
      await tick();
      expect(statusCalls(f)).toHaveLength(0);
      expect(cardChargeLockFor(event.id)).not.toBeNull();
      expect(cardChargeLockFor(event.id)!.accessToken).toBeNull();
      expect(screen.getByTestId("text-payment-poll-status")).toHaveTextContent(/recebe o ingresso por e-mail/);
      expect(amber()).toHaveTextContent(UNCONFIRMED);

      // A new mount (the next buyer on the same tab) stays locked and does not poll either.
      authState.user = account;
      remount();
      await user.click(cardTab());
      expect(submit()).toBeDisabled();
      await tick();
      expect(statusCalls(f)).toHaveLength(0);
      expect(screen.getByTestId("text-payment-poll-status")).toHaveTextContent(/recebe o ingresso por e-mail/);
    });

    it("R2: a card POST in flight across an auth change locks the card but never stores the old guest token", async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const base = serve({ orders: [], checkStatus: [{ status: 200, body: { status: "paid", paymentStatus: "CONFIRMED" } }] });
      const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/orders") {
          await gate;
          return json(202, unconfirmedBody);
        }
        return base(input, init);
      });
      vi.stubGlobal("fetch", f);
      const { user } = setup({ buyer: guest });
      await fillCard(user);
      await pay(user);
      await waitFor(() => expect(cardChargeLockFor(event.id)).not.toBeNull());

      act(() => dropGuestAccessTokens());
      await act(async () => {
        release();
      });
      await screen.findByTestId("text-payment-unconfirmed");

      const lock = cardChargeLockFor(event.id)!;
      expect(lock.orderId).toBe(ORDER_ID);
      expect(lock.accessToken).toBeNull();
      expect(lock.guestTokenDropped).toBe(true);
      await tick();
      await tick();
      expect(statusCalls(f as unknown as FetchMock)).toHaveLength(0);
    });

    it("a 201 under risk analysis survives close and reopen, resumes session polling, and a polled cancel releases it", async () => {
      authState.user = account;
      const f = serve({
        orders: [
          {
            status: 201,
            body: {
              order: { id: ORDER_ID, status: "pending", amount: "104.00" },
              payment: { id: "pay_1", status: "AWAITING_RISK_ANALYSIS", value: 104, installmentCount: 1 },
            },
          },
        ],
        checkStatus: [
          { status: 200, body: { message: "Status do pedido: cancelled", order: { id: ORDER_ID, status: "cancelled" }, paymentStatus: "REFUNDED" } },
        ],
      });
      vi.stubGlobal("fetch", f);
      const { user, close, reopen } = setup();
      await fillCard(user);
      await pay(user);
      expect(await screen.findByText("Pagamento em análise")).toBeInTheDocument();

      close();
      reopen();
      await user.click(cardTab());
      expect(amber()).toHaveTextContent(UNCONFIRMED);
      expect(submit()).toBeDisabled();
      await tick();
      expect(statusCalls(f)).toHaveLength(1);
      expect(statusCalls(f)[0][1]!.headers).not.toHaveProperty("X-Order-Access");
      expect(await screen.findByTestId("text-payment-poll-status")).toHaveTextContent("Pagamento cancelado");
      expect(amber()).toBeNull();
      expect(submit()).toBeEnabled();

      close();
      reopen();
      await user.click(cardTab());
      expect(amber()).toBeNull();
      expect(submit()).toBeEnabled();
    });

    it("a cancelled PIX order does not free a locked card", async () => {
      authState.user = account;
      const f = serve({
        orders: [
          { status: 504, html: "<html>504</html>" },
          {
            status: 201,
            body: {
              order: { id: ORDER_ID, status: "pending", amount: "105.00" },
              payment: { id: "pay_2", status: "PENDING", value: 105, pixQrCode: "x", pixPayload: "PIX-PAYLOAD" },
            },
          },
        ],
        checkStatus: [{ status: 200, body: { message: "Status do pedido: cancelled", order: { id: ORDER_ID, status: "cancelled" } } }],
      });
      vi.stubGlobal("fetch", f);
      const { user, close, reopen } = setup();
      await fillCard(user);
      await pay(user);
      await screen.findByTestId("text-payment-unconfirmed");
      await user.click(screen.getByRole("tab", { name: /PIX/ }));
      await pay(user);
      expect(await screen.findByText("PIX Gerado com Sucesso!")).toBeInTheDocument();
      await tick();
      expect(await screen.findByTestId("text-payment-poll-status")).toHaveTextContent("Pagamento cancelado");

      close();
      reopen();
      await user.click(cardTab());
      expect(amber()).toHaveTextContent(UNCONFIRMED);
      expect(submit()).toBeDisabled();
    });

    it("a polling 404 keeps the lock", async () => {
      const f = serve({
        orders: [{ status: 202, body: unconfirmedBody }],
        checkStatus: [{ status: 404, body: { message: "Pedido não encontrado" } }],
      });
      vi.stubGlobal("fetch", f);
      const { user, close, reopen } = setup({ buyer: guest });
      await fillCard(user);
      await pay(user);
      await screen.findByTestId("text-payment-unconfirmed");
      await tick();
      expect(await screen.findByTestId("text-payment-poll-status")).toHaveTextContent(EMAIL_LATER);

      close();
      reopen();
      await user.click(cardTab());
      expect(amber()).toHaveTextContent(UNCONFIRMED);
      expect(submit()).toBeDisabled();
    });

    it("a modal unmounted while the charge is in flight comes back locked; the late answer still settles the lock", async () => {
      authState.user = account;
      let release!: (response: Response) => void;
      const f = vi.fn((input: RequestInfo | URL, _init?: RequestInit) =>
        String(input) === "/api/orders"
          ? new Promise<Response>((resolve) => {
              release = resolve;
            })
          : Promise.resolve(json(404, {})),
      );
      vi.stubGlobal("fetch", f);
      const { user, remount } = setup();
      await fillCard(user);
      await pay(user);
      expect(orderCalls(f as unknown as FetchMock)).toHaveLength(1);

      remount();
      expect(amber()).toHaveTextContent(UNCONFIRMED);
      await user.click(cardTab());
      expect(submit()).toBeDisabled();

      await act(async () => release(json(402, { code: "card_declined", message: DECLINED })));
      await waitFor(() => expect(cardChargeLockFor(event.id)).toBeNull());
      remount();
      await user.click(cardTab());
      expect(amber()).toBeNull();
      expect(submit()).toBeEnabled();
    });

    it.each([
      [402, "card_declined", {}],
      [400, "invalid_card", {}],
      [403, "turnstile_failed", {}],
      [429, "rate_limited", {}],
      [502, "payment_provider_error", {}],
      [400, "identity_required", { missing: ["document"] }],
      [409, "identity_conflict", {}],
    ])("a JSON %i %s (retry-safe) leaves no lock behind", async (status, code, extra) => {
      const f = serve({ orders: [{ status, body: { code, message: "Mensagem do servidor.", ...extra } }] });
      vi.stubGlobal("fetch", f);
      const { user, remount } = setup({ buyer: guest });
      await fillCard(user);
      await pay(user);
      await answered();
      expect(cardChargeLockFor(event.id)).toBeNull();

      remount();
      await user.click(cardTab());
      expect(amber()).toBeNull();
      expect(submit()).toBeEnabled();
    });
  });
});
