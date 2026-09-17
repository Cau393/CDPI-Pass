import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const setLocation = vi.fn();
vi.mock("wouter", () => ({
  useLocation: () => ["/", setLocation],
}));

const authState = { isAuthenticated: false };
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("../../hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("../../components/PaymentModal", () => ({
  default: () => <div data-testid="payment-modal" />,
}));

import HomePage from "../../pages/HomePage";
import { getQueryFn } from "../../lib/queryClient";

const EVENT_ID = "22222222-2222-2222-2222-222222222222";
const COVER_URL = "https://cdn.example.com/covers/peptideos-1920x1080.webp";

const baseEvent = {
  id: EVENT_ID,
  title: "Workshop - Peptídeos: Biológicos e Sintéticos",
  description: "<p>O maior evento de peptídeos da América Latina.</p>",
  date: "2027-10-20T11:30:00.000Z",
  location: "Conselho Federal de Farmácia (CFF) - Brasília - DF",
  price: "0.00",
  imageUrl: COVER_URL,
  maxAttendees: null,
  currentAttendees: 0,
  isActive: true,
  npsType: "cdpi_event",
  isFree: true,
  salesClosed: false,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <HomePage />
    </QueryClientProvider>,
  );
}

function mockApi(
  eventOrEvents: Record<string, unknown> | Record<string, unknown>[],
  subscribe?: { status: number; body: unknown },
) {
  const events = Array.isArray(eventOrEvents) ? eventOrEvents : [eventOrEvents];
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (url.includes("/subscribe") && method === "POST") {
      const res = subscribe ?? {
        status: 201,
        body: { message: "Inscrição confirmada!" },
      };
      return new Response(JSON.stringify(res.body), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/events")) {
      return new Response(JSON.stringify(events), {
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
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

describe("HomePage — main event cover image", () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("fits the main event poster with object-contain", async () => {
    vi.stubGlobal("fetch", mockApi(baseEvent));
    renderPage();

    const wrapper = await screen.findByTestId("img-main-event");
    const foreground = wrapper.querySelector(`img[alt="${baseEvent.title}"]`);
    expect(foreground).toHaveClass("object-contain");
  });

  it("does not stretch the main event poster with object-fill", async () => {
    vi.stubGlobal("fetch", mockApi(baseEvent));
    renderPage();

    const wrapper = await screen.findByTestId("img-main-event");
    const foreground = wrapper.querySelector(`img[alt="${baseEvent.title}"]`);
    expect(foreground).not.toHaveClass("object-fill");
  });

  it("gives the cover a full-width 16:9 frame on mobile", async () => {
    vi.stubGlobal("fetch", mockApi(baseEvent));
    renderPage();

    const wrapper = await screen.findByTestId("img-main-event");
    expect(wrapper).toHaveClass("w-full", "aspect-video");
    expect(wrapper.className).toMatch(/md:aspect-auto/);
  });

  it("uses a compact side-by-side layout from tablet widths", async () => {
    vi.stubGlobal("fetch", mockApi(baseEvent));
    renderPage();

    const layout = await screen.findByTestId("main-event-layout");
    expect(layout.className).toMatch(/md:grid-cols/);
    expect(layout.className).toMatch(/md:items-stretch/);
  });

  it("limits the homepage description to a short teaser", async () => {
    const longDescription = `<p>${"Descrição longa para o evento e seus participantes. ".repeat(10)}</p>`;
    vi.stubGlobal(
      "fetch",
      mockApi({ ...baseEvent, description: longDescription }),
    );
    renderPage();

    const description = await screen.findByTestId("main-event-description");
    expect(description).toHaveClass("md:hidden", "line-clamp-2");
    expect(description.textContent?.length).toBeLessThanOrEqual(90);
    expect(description).toHaveTextContent(/…$/);
  });

  it("keeps a short homepage description unchanged", async () => {
    vi.stubGlobal("fetch", mockApi(baseEvent));
    renderPage();

    const description = await screen.findByTestId("main-event-description");
    expect(description).toHaveTextContent(
      "O maior evento de peptídeos da América Latina.",
    );
  });

  it("shows Grátis without a convenience-fee label for a free event", async () => {
    vi.stubGlobal("fetch", mockApi(baseEvent));
    renderPage();

    expect(await screen.findByText("Grátis")).toBeInTheDocument();
    expect(screen.getByTestId("button-buy-main")).toHaveTextContent(
      "Confirmar inscrição",
    );
    expect(
      screen.queryByText("+ taxa de conveniência"),
    ).not.toBeInTheDocument();
  });

  it("keeps the price and convenience-fee label for a paid event", async () => {
    vi.stubGlobal(
      "fetch",
      mockApi({ ...baseEvent, isFree: false, price: "100.00" }),
    );
    renderPage();

    expect(await screen.findByText(/R\$\s*100[,.]00/)).toBeInTheDocument();
    expect(screen.getByTestId("button-buy-main")).toHaveTextContent(
      "Comprar Ingresso",
    );
    expect(screen.getByText("+ taxa de conveniência")).toBeInTheDocument();
  });

  it("subscribes in place for a free event and never opens the payment modal", async () => {
    authState.isAuthenticated = true;
    localStorage.setItem("token", "test-token");
    const fetchMock = mockApi(baseEvent);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("button-buy-main"));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(
        ([input, init]) =>
          `${(init as RequestInit)?.method ?? "GET"} ${String(input)}`,
      );
      expect(
        calls.some((c) => c === `POST /api/events/${EVENT_ID}/subscribe`),
      ).toBe(true);
      expect(calls.some((c) => c === "POST /api/orders")).toBe(false);
    });

    expect(screen.queryByTestId("payment-modal")).not.toBeInTheDocument();
    localStorage.clear();
  });

  it("shows Grátis in the sidebar instead of R$ 0.00", async () => {
    const sidebarEvent = {
      ...baseEvent,
      id: "33333333-3333-3333-3333-333333333333",
      title: "Segundo evento gratuito",
      date: "2027-11-20T11:30:00.000Z",
    };
    vi.stubGlobal("fetch", mockApi([baseEvent, sidebarEvent]));
    renderPage();

    expect(await screen.findByText("Segundo evento gratuito")).toBeInTheDocument();
    expect(screen.queryByText(/R\$\s*0[,.]00/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Grátis").length).toBeGreaterThanOrEqual(2);
  });

  it("shows the gradient placeholder when the event has no cover", async () => {
    vi.stubGlobal("fetch", mockApi({ ...baseEvent, imageUrl: null }));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Evento")).toBeInTheDocument();
    });
    expect(screen.getByText("CDPI")).toBeInTheDocument();
  });
});

describe("HomePage — contact", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the support email in the footer", async () => {
    vi.stubGlobal("fetch", mockApi(baseEvent));
    renderPage();

    expect(
      await screen.findByText("relacionamento.mkt@cdpipharma.com.br"),
    ).toBeInTheDocument();
  });

  it("shows the landline in the footer", async () => {
    vi.stubGlobal("fetch", mockApi(baseEvent));
    renderPage();

    expect(await screen.findByText(/3636-9909/)).toBeInTheDocument();
  });

  it("shows the WhatsApp numbers in the footer", async () => {
    vi.stubGlobal("fetch", mockApi(baseEvent));
    renderPage();

    expect(await screen.findByText(/99865-5500/)).toBeInTheDocument();
    expect(screen.getByText(/99610-1694/)).toBeInTheDocument();
  });

  it("links the support email with mailto", async () => {
    vi.stubGlobal("fetch", mockApi(baseEvent));
    renderPage();

    expect(
      await screen.findByRole("link", {
        name: "relacionamento.mkt@cdpipharma.com.br",
      }),
    ).toHaveAttribute("href", "mailto:relacionamento.mkt@cdpipharma.com.br");
  });

  it("does not show the retired site number", async () => {
    vi.stubGlobal("fetch", mockApi(baseEvent));
    renderPage();

    await screen.findByTestId("site-footer");
    expect(screen.queryByText(/99860-6833/)).not.toBeInTheDocument();
  });
});
