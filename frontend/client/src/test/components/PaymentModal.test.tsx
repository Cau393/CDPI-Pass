import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Event } from "@shared/schema";

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const FOREIGN_USER = { id: "user-1", name: "Participante Estrangeira", isForeigner: true };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: FOREIGN_USER }) }));

import PaymentModal from "@/components/PaymentModal";

const EVENT = {
  id: "event-1",
  title: "Congresso CDPI",
  date: "2026-11-20T12:00:00.000Z",
  location: "Goiânia",
  price: "100.00",
  isFree: false,
  modality: "presencial",
} as unknown as Event;

const UNAVAILABLE =
  "Pagamento com cartão internacional indisponível no momento; seu pedido não foi criado.";

afterEach(() => {
  vi.unstubAllGlobals();
  toast.mockClear();
});

describe("PaymentModal payment errors", () => {
  it("shows the server's message instead of the raw status and JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ code: "foreign_payment_unavailable", message: UNAVAILABLE }), {
          status: 503,
        }),
      ),
    );
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PaymentModal
          isOpen
          onClose={() => {}}
          event={EVENT}
          promoCode={null}
          displayPrice={105}
          onSuccess={() => {}}
        />
      </QueryClientProvider>,
    );

    await user.click(screen.getByTestId("button-confirm-payment"));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: UNAVAILABLE })),
    );
  });
});
