import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const setLocation = vi.fn();
vi.mock("wouter", () => ({
  useParams: () => ({ id: "11111111-1111-1111-1111-111111111111" }),
  useLocation: () => ["/event/11111111-1111-1111-1111-111111111111", setLocation],
}));

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
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
    expect(screen.getByText(/Sem taxa de conveniência/)).toBeInTheDocument();
    expect(
      screen.queryByText(/taxa de conveniência de R\$ 5,00/),
    ).not.toBeInTheDocument();
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
