import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const setLocation = vi.fn();
vi.mock("wouter", () => ({
  useLocation: () => ["/", setLocation],
}));

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: false }),
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

function mockApi(event: Record<string, unknown>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/events")) {
      return new Response(JSON.stringify([event]), {
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

  it("gives the cover a full-width 16:9 frame", async () => {
    vi.stubGlobal("fetch", mockApi(baseEvent));
    renderPage();

    const wrapper = await screen.findByTestId("img-main-event");
    expect(wrapper).toHaveClass("w-full", "aspect-video");
  });

  it("uses a compact side-by-side layout from tablet widths", async () => {
    vi.stubGlobal("fetch", mockApi(baseEvent));
    renderPage();

    const layout = await screen.findByTestId("main-event-layout");
    expect(layout.className).toMatch(/md:grid-cols/);
  });

  it("limits the homepage description to a short teaser", async () => {
    vi.stubGlobal("fetch", mockApi(baseEvent));
    renderPage();

    const description = await screen.findByTestId("main-event-description");
    expect(description).toHaveClass("line-clamp-2");
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
