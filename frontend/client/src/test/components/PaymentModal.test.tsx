import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Event } from "@shared/schema";

const authState: { user: { isForeigner: boolean } | undefined } = { user: undefined };
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.user, isAuthenticated: true }),
}));

const toastSpy = vi.fn();
vi.mock("../../hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

import PaymentModal from "../../components/PaymentModal";

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

function renderModal(onIdentityRequired = vi.fn()) {
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
});
