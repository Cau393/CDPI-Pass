import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ADR-017 Stage 5 fix, with the real dialog and the real PaymentModal: a guest whose order is refused
// with 400 invalid_buyer goes back to the identity dialog, prefilled, at the input to fix.
const EVENT_ID = "77777777-7777-7777-7777-777777777777";

vi.mock("wouter", () => ({
  useParams: () => ({ id: EVENT_ID }),
  useLocation: () => [`/event/${EVENT_ID}`, vi.fn()],
}));
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false, user: undefined }),
}));
const toastSpy = vi.fn();
vi.mock("../../hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

import EventDetailsPage from "../../pages/EventDetailsPage";
import { getQueryFn } from "../../lib/queryClient";
import { resetCardChargeLocks } from "../../lib/cardChargeLock";

const paidOnlineEvent = {
  id: EVENT_ID,
  title: "Webinar CDPI",
  description: "<p>Descrição</p>",
  date: "2026-12-03T12:00:00.000Z",
  location: "Zoom",
  price: "100.00",
  imageUrl: null,
  maxAttendees: null,
  currentAttendees: 0,
  isActive: true,
  npsType: "cdpi_event",
  isFree: false,
  salesClosed: false,
  modality: "online",
  registrationForm: [],
};

const pixCreated = {
  order: { id: "88888888-8888-8888-8888-888888888888", status: "pending", amount: "105.00" },
  orderAccessToken: "ord-tok",
  payment: { id: "pay_1", status: "PENDING", value: 105, pixQrCode: "x", pixPayload: "PIX-PAYLOAD" },
};

type Reply = { status: number; body: unknown };
const json = ({ status, body }: Reply) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** POST /api/orders answers from a queue (the last one repeats); everything else is the event or empty. */
function mockApi(orderReplies: Reply[]) {
  const queue = [...orderReplies];
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/orders" && init?.method === "POST") return json(queue.length > 1 ? queue.shift()! : queue[0]);
    if (url.includes(`/api/events/${EVENT_ID}`)) return json({ status: 200, body: paidOnlineEvent });
    return json({ status: 200, body: {} });
  });
}

const orderBodies = (f: ReturnType<typeof mockApi>) =>
  f.mock.calls
    .filter(([url, init]) => String(url) === "/api/orders" && init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init!.body)));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EventDetailsPage />
    </QueryClientProvider>,
  );
}

async function buyAsGuest(user: ReturnType<typeof userEvent.setup>, cpf = "52998224725") {
  await user.click(await screen.findByTestId("button-event-cta"));
  await user.type(await screen.findByTestId("input-guest-name"), "Camila Souza");
  await user.type(screen.getByTestId("input-guest-email"), "camila@example.com");
  await user.click(screen.getByTestId("input-guest-phone"));
  await user.keyboard("{End}");
  await user.type(screen.getByTestId("input-guest-phone"), "11987654321");
  await user.type(screen.getByLabelText("CPF"), cpf);
  await user.click(screen.getByTestId("button-confirm-registration"));
  await user.click(await screen.findByTestId("button-confirm-payment"));
}

describe("EventDetailsPage — guest identity correction (real dialog and payment modal)", () => {
  beforeEach(() => {
    window.history.pushState({}, "", `/event/${EVENT_ID}`);
  });
  afterEach(() => {
    resetCardChargeLocks();
    window.history.pushState({}, "", "/");
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("a 400 invalid_buyer on the CPF reopens the dialog prefilled, the message under the CPF, focused; the fix goes through", async () => {
    const f = mockApi([
      { status: 400, body: { code: "invalid_buyer", message: "CPF inválido", field: "cpf" } },
      { status: 201, body: pixCreated },
    ]);
    vi.stubGlobal("fetch", f);
    const user = userEvent.setup();
    renderPage();
    await buyAsGuest(user);

    expect((await screen.findByTestId("text-cpf-error")).textContent).toBe("CPF inválido");
    expect(screen.queryByTestId("button-confirm-payment")).toBeNull();
    const cpf = screen.getByLabelText("CPF") as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(cpf));
    expect(cpf.value).toBe("529.982.247-25");
    expect((screen.getByTestId("input-guest-name") as HTMLInputElement).value).toBe("Camila Souza");
    expect((screen.getByTestId("input-guest-email") as HTMLInputElement).value).toBe("camila@example.com");
    expect(toastSpy).not.toHaveBeenCalled();

    await user.clear(cpf);
    await user.type(cpf, "11144477735");
    await user.click(screen.getByTestId("button-confirm-registration"));
    await user.click(await screen.findByTestId("button-confirm-payment"));

    expect(await screen.findByText("PIX Gerado com Sucesso!")).toBeInTheDocument();
    expect(orderBodies(f).map((body) => body.buyer.cpf)).toEqual(["529.982.247-25", "111.444.777-35"]);
  });

  it("an invalid_buyer without a field reopens the dialog with the message at the top", async () => {
    vi.stubGlobal("fetch", mockApi([{ status: 400, body: { code: "invalid_buyer", message: "Informe seus dados para continuar." } }]));
    const user = userEvent.setup();
    renderPage();
    await buyAsGuest(user);

    expect((await screen.findByTestId("text-registration-buyer-error")).textContent).toBe("Informe seus dados para continuar.");
    expect((screen.getByTestId("input-guest-email") as HTMLInputElement).value).toBe("camila@example.com");
  });

  it("“Voltar e editar dados” returns to the prefilled dialog, and the edited buyer is sent", async () => {
    const f = mockApi([{ status: 201, body: pixCreated }]);
    vi.stubGlobal("fetch", f);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("button-event-cta"));
    await user.type(await screen.findByTestId("input-guest-name"), "Camila Souza");
    await user.type(screen.getByTestId("input-guest-email"), "camila@example.com");
    await user.click(screen.getByTestId("input-guest-phone"));
    await user.keyboard("{End}");
    await user.type(screen.getByTestId("input-guest-phone"), "11987654321");
    await user.type(screen.getByLabelText("CPF"), "52998224725");
    await user.click(screen.getByTestId("button-confirm-registration"));

    await user.click(await screen.findByTestId("button-payment-edit-buyer"));
    const email = (await screen.findByTestId("input-guest-email")) as HTMLInputElement;
    expect(email.value).toBe("camila@example.com");
    expect(screen.queryByTestId("button-confirm-payment")).toBeNull();
    await user.clear(email);
    await user.type(email, "camila.souza@example.com");
    await user.click(screen.getByTestId("button-confirm-registration"));
    await user.click(await screen.findByTestId("button-confirm-payment"));

    expect(await screen.findByText("PIX Gerado com Sucesso!")).toBeInTheDocument();
    expect(orderBodies(f)).toHaveLength(1);
    expect(orderBodies(f)[0].buyer.email).toBe("camila.souza@example.com");
  });
});
