import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const setLocation = vi.fn();
const navigation = { search: "?code=CDPITEST123" };

vi.mock("wouter", () => ({
  useLocation: () => ["/cortesia", setLocation],
  useSearch: () => navigation.search,
}));

const authState = {
  isAuthenticated: false,
  isLoading: false,
  user: null as null | { email: string; name: string },
};
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => authState,
}));

const toastSpy = vi.fn();
vi.mock("../../hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

import CourtesyRedeemPage from "../../pages/CourtesyRedeemPage";

const EVENT_ID = "11111111-1111-1111-1111-111111111111";
const CODE = "CDPITEST123";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CourtesyRedeemPage />
    </QueryClientProvider>,
  );
}

function mockLink(body: unknown, status = 200) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes(`/api/courtesy-links/${CODE}`)) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("{}", {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  });
}

describe("CourtesyRedeemPage — logged-out code", () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    authState.user = null;
    navigation.search = `?code=${CODE}`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("sends a valid free code to the event page and does not go to login", async () => {
    vi.stubGlobal(
      "fetch",
      mockLink({
        code: CODE,
        overridePrice: null,
        event: { id: EVENT_ID, title: "Congresso CDPI 2026" },
      }),
    );
    renderPage();

    await waitFor(() => {
      expect(setLocation).toHaveBeenCalledWith(
        `/event/${EVENT_ID}?cortesia=${CODE}`,
      );
    });
    expect(setLocation).not.toHaveBeenCalledWith(
      expect.stringContaining("/login"),
    );
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it("sends a promo code to the event promo query", async () => {
    vi.stubGlobal(
      "fetch",
      mockLink({
        code: CODE,
        overridePrice: "40.00",
        event: { id: EVENT_ID, title: "Congresso CDPI 2026" },
      }),
    );
    renderPage();

    await waitFor(() => {
      expect(setLocation).toHaveBeenCalledWith(
        `/event/${EVENT_ID}?promo=${CODE}`,
      );
    });
    expect(setLocation).not.toHaveBeenCalledWith(
      expect.stringContaining("/login"),
    );
  });

  it("keeps the invalid-code card when the link cannot be resolved", async () => {
    vi.stubGlobal(
      "fetch",
      mockLink({ message: "Link de cortesia não encontrado" }, 404),
    );
    renderPage();

    expect(
      await screen.findByText("Link de cortesia não encontrado"),
    ).toBeInTheDocument();
    expect(setLocation).not.toHaveBeenCalled();
  });
});

describe("CourtesyRedeemPage — logged-in code", () => {
  beforeEach(() => {
    authState.isAuthenticated = true;
    authState.isLoading = false;
    authState.user = { email: "ana@example.com", name: "Ana" };
    navigation.search = `?code=${CODE}`;
  });

  afterEach(() => {
    authState.user = null;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("keeps the attendee form and does not leave for the event page", async () => {
    vi.stubGlobal(
      "fetch",
      mockLink({
        code: CODE,
        overridePrice: null,
        remainingTickets: 1,
        event: { id: EVENT_ID, title: "Congresso CDPI 2026" },
      }),
    );
    renderPage();

    expect(await screen.findByTestId("button-redeem")).toBeInTheDocument();
    expect(screen.getByText("Congresso CDPI 2026")).toBeInTheDocument();
    expect(setLocation).not.toHaveBeenCalled();
  });
});

describe("CourtesyRedeemPage — manual code", () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    navigation.search = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("resolves Continuar to the event page instead of login", async () => {
    vi.stubGlobal(
      "fetch",
      mockLink({
        code: CODE,
        overridePrice: null,
        event: { id: EVENT_ID, title: "Congresso CDPI 2026" },
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByTestId("input-courtesy-code"), CODE);
    await user.click(screen.getByTestId("button-submit-code"));

    await waitFor(() => {
      expect(setLocation).toHaveBeenCalledWith(
        `/event/${EVENT_ID}?cortesia=${CODE}`,
      );
    });
    expect(setLocation).not.toHaveBeenCalledWith(
      expect.stringContaining("/login"),
    );
  });
});
