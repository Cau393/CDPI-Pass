import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const setLocation = vi.fn();
vi.mock("wouter", () => ({
  useParams: () => ({ id: "11111111-1111-1111-1111-111111111111" }),
  useLocation: () => ["/event/11111111-1111-1111-1111-111111111111", setLocation],
}));

const authState = { isAuthenticated: true };
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => authState,
}));

const toastSpy = vi.fn();
vi.mock("../../hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

// The payment modal is the paid path; a free event must never open it.
vi.mock("../../components/PaymentModal", () => ({
  default: () => <div data-testid="payment-modal" />,
}));

import EventDetailsPage from "../../pages/EventDetailsPage";
import { getQueryFn } from "../../lib/queryClient";

const EVENT_ID = "11111111-1111-1111-1111-111111111111";

const baseEvent = {
  id: EVENT_ID,
  title: "Congresso CDPI 2026",
  description: "<p>Descrição</p>",
  date: new Date("2026-09-03T12:00:00.000Z").toISOString(),
  location: "São Paulo",
  price: "100.00",
  imageUrl: null,
  maxAttendees: null,
  currentAttendees: 0,
  isActive: true,
  npsType: "cdpi_event",
  isFree: false,
  salesClosed: false,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      // Mirror the app's client: the event query relies on the default queryFn
      // that derives the URL from the query key.
      queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EventDetailsPage />
    </QueryClientProvider>,
  );
}

/** Route the component's fetches; `event` overrides the event row returned. */
function mockApi(event: Record<string, unknown>, subscribe?: { status: number; body: unknown }) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (url.includes(`/api/events/${EVENT_ID}/subscribe`) && method === "POST") {
      const res = subscribe ?? { status: 201, body: { message: "Inscrição confirmada!" } };
      return new Response(JSON.stringify(res.body), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes(`/api/events/${EVENT_ID}`)) {
      return new Response(JSON.stringify(event), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/orders")) {
      return new Response(JSON.stringify({ orders: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

describe("EventDetailsPage — paid event (unchanged behaviour)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockApi(baseEvent));
    localStorage.setItem("token", "test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows the price and the R$5 convenience fee", async () => {
    renderPage();
    expect(await screen.findByText(/Comprar Ingresso/)).toBeInTheDocument();
    expect(screen.getByText(/taxa de conveniência de R\$ 5,00/)).toBeInTheDocument();
  });
});

describe("EventDetailsPage — 'Evento Grátis'", () => {
  const freeEvent = { ...baseEvent, price: "0.00", isFree: true };

  beforeEach(() => {
    localStorage.setItem("token", "test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows 'Grátis' and hides the convenience fee copy", async () => {
    vi.stubGlobal("fetch", mockApi(freeEvent));
    renderPage();

    expect(await screen.findByText("Grátis")).toBeInTheDocument();
    expect(screen.queryByText(/taxa de conveniência/)).not.toBeInTheDocument();
  });

  it("offers a confirmation button instead of a purchase button", async () => {
    vi.stubGlobal("fetch", mockApi(freeEvent));
    renderPage();

    expect(await screen.findByText("Confirmar inscrição")).toBeInTheDocument();
    expect(screen.queryByText("Comprar Ingresso")).not.toBeInTheDocument();
  });

  it("subscribes via the free endpoint and never opens the payment modal", async () => {
    const fetchMock = mockApi(freeEvent);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("button-event-cta"));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(
        ([input, init]) => `${(init as RequestInit)?.method ?? "GET"} ${String(input)}`,
      );
      expect(
        calls.some((c) => c === `POST /api/events/${EVENT_ID}/subscribe`),
      ).toBe(true);
      // The paid checkout route must not be touched: no Asaas charge.
      expect(calls.some((c) => c === "POST /api/orders")).toBe(false);
    });

    expect(screen.queryByTestId("payment-modal")).not.toBeInTheDocument();
  });

  it("surfaces a server rejection instead of pretending it worked", async () => {
    vi.stubGlobal(
      "fetch",
      mockApi(freeEvent, {
        status: 409,
        body: { message: "As vendas para este evento foram encerradas." },
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("button-event-cta"));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
    });
  });
});

describe("EventDetailsPage — 'Encerrar Vendas'", () => {
  beforeEach(() => {
    localStorage.setItem("token", "test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("disables the CTA and explains why on a paid event", async () => {
    vi.stubGlobal("fetch", mockApi({ ...baseEvent, salesClosed: true }));
    renderPage();

    const cta = await screen.findByTestId("button-event-cta");
    expect(cta).toBeDisabled();
    expect(cta).toHaveTextContent("Vendas encerradas");
    expect(screen.getByTestId("text-sales-closed")).toBeInTheDocument();
  });

  it("also blocks the free subscription CTA", async () => {
    vi.stubGlobal(
      "fetch",
      mockApi({ ...baseEvent, price: "0.00", isFree: true, salesClosed: true }),
    );
    renderPage();

    const cta = await screen.findByTestId("button-event-cta");
    expect(cta).toBeDisabled();
    expect(cta).toHaveTextContent("Vendas encerradas");
  });

  it("leaves the event page itself reachable, since the event stays active", async () => {
    vi.stubGlobal("fetch", mockApi({ ...baseEvent, salesClosed: true }));
    renderPage();

    // Closing sales must not hide the event or its details.
    expect(await screen.findByText("Congresso CDPI 2026")).toBeInTheDocument();
    expect(screen.getByText("São Paulo")).toBeInTheDocument();
  });
});

describe("EventDetailsPage — cover image", () => {
  const COVER_URL = "https://cdn.example.com/covers/poster-1408x768.jpeg";

  beforeEach(() => {
    vi.stubGlobal("fetch", mockApi({ ...baseEvent, imageUrl: COVER_URL }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the whole poster with object-contain instead of cropping it", async () => {
    renderPage();

    const cover = await screen.findByRole("img", { name: baseEvent.title });
    expect(cover).toHaveClass("object-contain");
  });

  it("never uses object-cover on the poster", async () => {
    renderPage();

    const cover = await screen.findByRole("img", { name: baseEvent.title });
    expect(cover).not.toHaveClass("object-cover");
  });

  it("keeps the poster in a 16:9 frame like the home card", async () => {
    renderPage();

    const cover = await screen.findByRole("img", { name: baseEvent.title });
    expect(cover.parentElement).toHaveClass("aspect-video");
  });

  it("loads the poster eagerly because it is the page's largest element", async () => {
    renderPage();

    const cover = await screen.findByRole("img", { name: baseEvent.title });
    expect(cover).toHaveAttribute("loading", "eager");
  });
});

// The real event the bug was reported against: a 1408x768 landscape poster whose
// sponsor row was cut off, plus a long description whose blank lines vanished.
describe("EventDetailsPage — Peptídeos poster and long description", () => {
  const PEPTIDEOS_COVER =
    "https://cdpi-pass-qr-codes.s3.sa-east-1.amazonaws.com/events/covers/90fab41c-22db-4660-8598-c9e32fdf9986.jpeg";
  const LONG_DESCRIPTION =
    "<p>No dia <strong>20 de outubro de 2026</strong>, o Auditório do Conselho Federal de Farmácia (CFF), em Brasília/DF, receberá um encontro internacional dedicado aos avanços científicos.<br /></p>" +
    "<p>O workshop reunirá especialistas para discutir <strong>diretrizes regulatórias do FDA, CMC, escalonamento industrial e validação de métodos</strong>.<br /></p>" +
    "<p>📅 <strong>20 de outubro de 2026</strong><br />📍 <strong>Auditório do CFF | Brasília/DF</strong><br />🎧 <strong>Tradução simultânea</strong></p>";

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      mockApi({
        ...baseEvent,
        title: "Workshop - Peptídeos: Biológicos e Sintéticos",
        imageUrl: PEPTIDEOS_COVER,
        description: LONG_DESCRIPTION,
        isFree: true,
        price: "0.00",
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the whole poster so the sponsor row is not cut off", async () => {
    renderPage();

    const cover = await screen.findByRole("img", {
      name: "Workshop - Peptídeos: Biológicos e Sintéticos",
    });
    expect(cover).toHaveClass("object-contain");
  });

  it("renders the blank line the admin typed after the opening paragraph", async () => {
    const { container } = renderPage();
    await screen.findByText(/encontro internacional/);

    expect(container.querySelectorAll("p:empty")).toHaveLength(2);
  });

  it("keeps the line breaks inside the date and venue paragraph", async () => {
    renderPage();
    await screen.findByText(/encontro internacional/);

    const description = document.querySelector("div.prose");
    expect(description).not.toBeNull();
    expect(description!.querySelectorAll("br")).toHaveLength(2);
  });
});

describe("EventDetailsPage — evento online", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      mockApi({
        ...baseEvent,
        modality: "online",
        location: "Zoom",
      }),
    );
    localStorage.setItem("token", "test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows the Evento Online badge and hides the meeting URL", async () => {
    renderPage();
    expect(await screen.findByText("Evento Online")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.queryByText("Zoom")).not.toBeInTheDocument();
    expect(screen.queryByText(/zoom\.us/i)).not.toBeInTheDocument();
  });
});

describe("EventDetailsPage — free online subscribe WhatsApp", () => {
  const WHATSAPP_URL = "https://chat.whatsapp.com/AbC";
  const freeOnline = {
    ...baseEvent,
    price: "0.00",
    isFree: true,
    modality: "online",
    location: "Zoom",
  };

  beforeEach(() => {
    localStorage.setItem("token", "test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("opens the WhatsApp group in a new tab after a successful subscribe", async () => {
    const openSpy = vi.fn(() => ({ closed: false }));
    vi.stubGlobal("open", openSpy);
    vi.stubGlobal(
      "fetch",
      mockApi(freeOnline, {
        status: 201,
        body: { message: "Inscrição confirmada!", whatsappGroupUrl: WHATSAPP_URL },
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("button-event-cta"));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(openSpy).toHaveBeenCalledWith(
        WHATSAPP_URL,
        "_blank",
        "noopener,noreferrer",
      );
    });
  });

  it("toasts Meus Ingressos when the WhatsApp popup is blocked", async () => {
    const openSpy = vi.fn(() => null);
    vi.stubGlobal("open", openSpy);
    vi.stubGlobal(
      "fetch",
      mockApi(freeOnline, {
        status: 201,
        body: { message: "Inscrição confirmada!", whatsappGroupUrl: WHATSAPP_URL },
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("button-event-cta"));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringMatching(/Meus Ingressos/i),
        }),
      );
    });
  });

  it("does not open a tab when the event has no WhatsApp group", async () => {
    const openSpy = vi.fn();
    vi.stubGlobal("open", openSpy);
    vi.stubGlobal(
      "fetch",
      mockApi(freeOnline, {
        status: 201,
        body: { message: "Inscrição confirmada!", whatsappGroupUrl: null },
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("button-event-cta"));

    await waitFor(() => {
      expect(setLocation).toHaveBeenCalledWith("/profile");
    });
    expect(openSpy).not.toHaveBeenCalled();
  });
});

const COURTESY_CODE = "CDPITEST123";

function mockCourtesyVisit(
  event: Record<string, unknown>,
  link: { status: number; body: unknown },
  orders: unknown[] = [],
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (url.includes(`/api/events/${EVENT_ID}/subscribe`) && method === "POST") {
      return new Response(JSON.stringify({ message: "Inscrição confirmada!" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/courtesy-links/")) {
      return new Response(JSON.stringify(link.body), {
        status: link.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes(`/api/events/${EVENT_ID}`)) {
      return new Response(JSON.stringify(event), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/orders")) {
      return new Response(JSON.stringify({ orders }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("{}", {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  });
}

describe("EventDetailsPage — free courtesy (?cortesia=)", () => {
  const validLink = {
    status: 200,
    body: {
      code: COURTESY_CODE,
      overridePrice: null,
      isActive: true,
      remainingTickets: 2,
      event: {
        id: EVENT_ID,
        title: "Título só da cortesia",
        meetingUrl: "https://zoom.us/j/secret-courtesy",
        location: "Sala secreta",
      },
    },
  };

  beforeEach(() => {
    authState.isAuthenticated = false;
    window.history.pushState(
      {},
      "",
      `/event/${EVENT_ID}?cortesia=${COURTESY_CODE}`,
    );
  });

  afterEach(() => {
    authState.isAuthenticated = true;
    window.history.pushState({}, "", "/");
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows the public event and Resgatar cortesia without a login redirect", async () => {
    vi.stubGlobal("fetch", mockCourtesyVisit(baseEvent, validLink));
    renderPage();

    expect(await screen.findByText("Congresso CDPI 2026")).toBeInTheDocument();
    expect(screen.getByText("São Paulo")).toBeInTheDocument();
    expect(screen.getByText("Cortesia")).toBeInTheDocument();
    expect(screen.getByTestId("button-event-cta")).toHaveTextContent(
      "Resgatar cortesia",
    );
    expect(screen.queryByText(/taxa de conveniência/)).not.toBeInTheDocument();
    expect(screen.queryByText("Título só da cortesia")).not.toBeInTheDocument();
    expect(screen.queryByText(/secret-courtesy/)).not.toBeInTheDocument();
    expect(screen.queryByText("Sala secreta")).not.toBeInTheDocument();
    expect(setLocation).not.toHaveBeenCalled();
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it("sends a logged-out click to login with the cortesia query preserved", async () => {
    vi.stubGlobal("fetch", mockCourtesyVisit(baseEvent, validLink));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("button-event-cta"));

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Login necessário",
        description: "Faça login ou cadastre-se para resgatar a cortesia.",
        variant: "destructive",
      }),
    );
    expect(setLocation).toHaveBeenCalledWith(
      `/login?next=${encodeURIComponent(`/event/${EVENT_ID}?cortesia=${COURTESY_CODE}`)}`,
    );
  });

  it("sends a logged-in click to the courtesy form and does not buy or subscribe", async () => {
    authState.isAuthenticated = true;
    localStorage.setItem("token", "test-token");
    const fetchMock = mockCourtesyVisit(baseEvent, validLink);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("button-event-cta"));

    expect(setLocation).toHaveBeenCalledWith(
      `/cortesia?code=${COURTESY_CODE}`,
    );
    expect(screen.queryByTestId("payment-modal")).not.toBeInTheDocument();
    const calls = fetchMock.mock.calls.map(
      ([input, init]) =>
        `${(init as RequestInit | undefined)?.method ?? "GET"} ${String(input)}`,
    );
    expect(calls.some((call) => call.includes("/subscribe"))).toBe(false);
    expect(calls.some((call) => call.startsWith("POST /api/orders"))).toBe(false);
  });

  it("keeps the courtesy CTA available when sales are closed", async () => {
    vi.stubGlobal(
      "fetch",
      mockCourtesyVisit({ ...baseEvent, salesClosed: true }, validLink),
    );
    renderPage();

    const cta = await screen.findByTestId("button-event-cta");
    expect(cta).toBeEnabled();
    expect(cta).toHaveTextContent("Resgatar cortesia");
    expect(screen.queryByTestId("text-sales-closed")).not.toBeInTheDocument();
  });

  it("does not offer full-price checkout for an invalid courtesy code", async () => {
    vi.stubGlobal(
      "fetch",
      mockCourtesyVisit(baseEvent, {
        status: 400,
        body: { message: "Link de cortesia inativo" },
      }),
    );
    renderPage();

    expect(await screen.findByText("Link de cortesia inativo")).toBeInTheDocument();
    expect(screen.queryByText("Comprar Ingresso")).not.toBeInTheDocument();
    expect(screen.getByTestId("button-event-cta")).toBeDisabled();
    expect(screen.queryByTestId("payment-modal")).not.toBeInTheDocument();
  });

  it("disables the courtesy CTA when the event is full", async () => {
    vi.stubGlobal(
      "fetch",
      mockCourtesyVisit(
        { ...baseEvent, maxAttendees: 10, currentAttendees: 10 },
        validLink,
      ),
    );
    renderPage();

    const cta = await screen.findByTestId("button-event-cta");
    expect(cta).toBeDisabled();
    expect(cta).toHaveTextContent("Evento Esgotado");
    expect(screen.getByText("Cortesia")).toBeInTheDocument();
    expect(screen.queryByText(/taxa de conveniência/)).not.toBeInTheDocument();
  });

  it("keeps an existing paid order as already confirmed", async () => {
    authState.isAuthenticated = true;
    localStorage.setItem("token", "test-token");
    vi.stubGlobal(
      "fetch",
      mockCourtesyVisit(baseEvent, validLink, [
        { eventId: EVENT_ID, status: "paid" },
      ]),
    );
    renderPage();

    expect(
      await screen.findByText(
        "Você já possui inscrição confirmada para este evento.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("button-event-cta")).toBeDisabled();
    expect(screen.getByText("Cortesia")).toBeInTheDocument();
  });

  it("switches an override-price code to the promo purchase path", async () => {
    vi.stubGlobal(
      "fetch",
      mockCourtesyVisit(baseEvent, {
        status: 200,
        body: {
          ...validLink.body,
          overridePrice: "80.00",
        },
      }),
    );
    renderPage();

    await waitFor(() => {
      expect(setLocation).toHaveBeenCalledWith(
        `/event/${EVENT_ID}?promo=${COURTESY_CODE}`,
      );
    });
    expect(await screen.findByText("Comprar Ingresso")).toBeInTheDocument();
    expect(screen.queryByText("Resgatar cortesia")).not.toBeInTheDocument();
    expect(screen.getByText(/Promoção aplicada/)).toBeInTheDocument();
  });
});
