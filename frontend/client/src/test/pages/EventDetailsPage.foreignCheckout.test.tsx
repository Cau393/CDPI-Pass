import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Real useAuth and PaymentModal: the card-only checkout must follow the
// account the server returns after the passport is saved.
const EVENT_ID = "55555555-5555-5555-5555-555555555555";

vi.mock("wouter", () => ({
  useParams: () => ({ id: EVENT_ID }),
  useLocation: () => [`/event/${EVENT_ID}`, vi.fn()],
}));

vi.mock("../../hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import EventDetailsPage from "../../pages/EventDetailsPage";
import { getQueryFn } from "../../lib/queryClient";
import { FOREIGN_PAID_CHECKOUT_ENABLED } from "@shared/foreignCheckout";

const paidOnlineEvent = {
  id: EVENT_ID,
  title: "Webinar CDPI",
  description: "<p>Descrição</p>",
  date: "2026-11-03T12:00:00.000Z",
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

const accountBefore = {
  id: "u1",
  name: "Juan Pérez",
  email: "juan@example.com",
  phone: "595981123456",
  cpf: null,
  isForeigner: false,
  foreignDocument: null,
  address: null,
};
const accountAfter = { ...accountBefore, isForeigner: true, foreignDocument: "AB123456" };

function mockApi(start: Record<string, unknown> = accountBefore) {
  let account: Record<string, unknown> = start;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    if (url === "/api/profile/identity" && method === "PUT") {
      account = accountAfter;
      return json(account);
    }
    if (url === "/api/auth/me") return json(account);
    if (url.includes("/api/orders")) return json({ orders: [] });
    if (url.includes(`/api/events/${EVENT_ID}`)) return json(paidOnlineEvent);
    return json({});
  });
}

describe("EventDetailsPage — foreign visitor checkout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function renderPage(fetchMock: ReturnType<typeof mockApi>) {
    localStorage.setItem("token", "test-token");
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <EventDetailsPage />
      </QueryClientProvider>,
    );
    return userEvent.setup();
  }

  const calls = (fetchMock: ReturnType<typeof mockApi>, method: string, url: string) =>
    fetchMock.mock.calls.filter(([input, init]) => String(input) === url && (init?.method ?? "GET") === method);

  it.runIf(!FOREIGN_PAID_CHECKOUT_ENABLED)(
    "ticking 'Sou estrangeiro' on a paid event explains that foreigners cannot buy yet and saves nothing",
    async () => {
      const fetchMock = mockApi();
      const user = renderPage(fetchMock);

      await user.click(await screen.findByTestId("button-event-cta"));
      await user.click(await screen.findByLabelText("Sou estrangeiro / I'm a foreign visitor"));

      expect(await screen.findByText(/Compras por estrangeiros ainda não estão disponíveis/)).toBeTruthy();
      expect((screen.getByTestId("button-confirm-registration") as HTMLButtonElement).disabled).toBe(true);
      await user.type(screen.getByLabelText("Passaporte / Passport"), "ab123456");
      await user.click(screen.getByTestId("button-confirm-registration"));
      expect(calls(fetchMock, "PUT", "/api/profile/identity")).toHaveLength(0);
      expect(screen.queryAllByRole("tab")).toHaveLength(0);
    },
  );

  it.runIf(!FOREIGN_PAID_CHECKOUT_ENABLED)(
    "an account that is already a foreign visitor sees why it cannot buy, and the buy button stays off",
    async () => {
      const fetchMock = mockApi(accountAfter);
      renderPage(fetchMock);

      expect(await screen.findByTestId("foreign-paid-unavailable")).toBeTruthy();
      expect((screen.getByTestId("button-event-cta") as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByText("Complete sua inscrição")).toBeNull();
    },
  );

  it.runIf(FOREIGN_PAID_CHECKOUT_ENABLED)("offers only the card once the account comes back as a foreign visitor", async () => {
    const user = renderPage(mockApi());

    await user.click(await screen.findByTestId("button-event-cta"));
    await user.click(await screen.findByLabelText("Sou estrangeiro / I'm a foreign visitor"));
    await user.type(screen.getByLabelText("Passaporte / Passport"), "ab123456");
    await user.click(screen.getByTestId("button-confirm-registration"));

    expect(
      (await screen.findAllByRole("tab")).map((tab) => tab.textContent?.trim()),
    ).toEqual(["Cartão"]);
  });
});
