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

type Account = {
  email: string;
  name: string;
  phone?: string;
  cpf?: string | null;
  address?: string | null;
  birthDate?: string | null;
  occupation?: string | null;
  partnerCompany?: string | null;
  areaOfActivity?: string | null;
};
const authState = {
  isAuthenticated: false,
  isLoading: false,
  user: null as null | Account,
};
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => authState,
}));

const toastSpy = vi.fn();
vi.mock("../../hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

import { LEGACY_QUESTIONS } from "@shared/eventRegistrationForm";
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

describe("CourtesyRedeemPage — registration questions", () => {
  const origem = {
    id: "q-origem",
    type: "radio",
    label: "Como soube do evento",
    options: ["Instagram", "Indicação"],
    required: true,
    archived: false,
  };

  function mockRedeem(event: Record<string, unknown>) {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/courtesy/redeem" && init?.method === "POST") {
        return new Response(JSON.stringify({ message: "ok" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ code: CODE, overridePrice: null, remainingTickets: 1, event }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
  }

  function redeemBodies(fetchMock: ReturnType<typeof mockRedeem>): unknown[] {
    return fetchMock.mock.calls
      .filter(([input, init]) => String(input) === "/api/courtesy/redeem" && init?.method === "POST")
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
  }

  beforeEach(() => {
    authState.isAuthenticated = true;
    authState.isLoading = false;
    navigation.search = `?code=${CODE}`;
    localStorage.setItem("token", "test-token");
  });
  afterEach(() => {
    authState.user = null;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("asks an online event only for contact data, without document, birth date or address", async () => {
    authState.user = { email: "juan@example.com", name: "Juan Pérez", phone: "595981123456" };
    vi.stubGlobal(
      "fetch",
      mockRedeem({ id: EVENT_ID, title: "Webinar CDPI", modality: "online", registrationForm: [origem] }),
    );
    renderPage();

    await screen.findByTestId("button-redeem");
    expect(
      [
        "input-cpf",
        "checkbox-foreigner",
        "input-foreign-document",
        "input-birth-date",
        "input-address",
      ].filter((testId) => screen.queryByTestId(testId)),
    ).toEqual([]);
  });

  it("redeems an online courtesy with a +595 phone and the answers", async () => {
    authState.user = { email: "juan@example.com", name: "Juan Pérez", phone: "595981123456" };
    const fetchMock = mockRedeem({
      id: EVENT_ID,
      title: "Webinar CDPI",
      modality: "online",
      registrationForm: [origem],
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByTestId("input-partner-company"), "Laboratorio Asunción");
    await user.type(screen.getByTestId("input-occupation"), "Farmacéutico");
    await user.click(screen.getByRole("radio", { name: "Instagram" }));
    await user.click(screen.getByTestId("button-redeem"));

    await waitFor(() => {
      expect(redeemBodies(fetchMock)).toEqual([
        {
          name: "Juan Pérez",
          email: "juan@example.com",
          emailConfirm: "juan@example.com",
          partnerCompany: "Laboratorio Asunción",
          occupation: "Farmacéutico",
          phone: "595981123456",
          code: CODE,
          answers: { "q-origem": "Instagram" },
        },
      ]);
    });
  });

  it("sends the answers with an in-person redemption", async () => {
    authState.user = {
      email: "ana@example.com",
      name: "Ana",
      phone: "5511999999999",
      cpf: "123.456.789-09",
      address: "Rua A, 100, São Paulo",
      birthDate: "1990-05-10T12:00:00.000Z",
    };
    const fetchMock = mockRedeem({
      id: EVENT_ID,
      title: "Congresso CDPI 2026",
      modality: "presencial",
      registrationForm: [origem],
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByTestId("input-partner-company"), "ACME");
    await user.type(screen.getByTestId("input-occupation"), "Farmacêutica");
    await user.click(screen.getByRole("radio", { name: "Indicação" }));
    await user.click(screen.getByTestId("button-redeem"));

    await waitFor(() => {
      expect(redeemBodies(fetchMock)).toEqual([
        expect.objectContaining({ cpf: "123.456.789-09", answers: { "q-origem": "Indicação" } }),
      ]);
    });
  });

  it("shows the question an admin added after the page loaded, once the redeem is refused for the old form", async () => {
    authState.user = { email: "juan@example.com", name: "Juan Pérez", phone: "595981123456" };
    const turno = {
      id: "q-turno",
      type: "radio",
      label: "Turno preferido",
      options: ["Manhã", "Tarde"],
      required: true,
      archived: false,
    };
    const event = { id: EVENT_ID, title: "Webinar CDPI", modality: "online" };
    let redeemed = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const json = (status: number, body: unknown) =>
          new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
        if (String(input) === "/api/courtesy/redeem" && init?.method === "POST") {
          redeemed = true;
          return json(400, { message: "Responda a pergunta obrigatória: Turno preferido" });
        }
        // The admin replaced the form between the first load and the redeem.
        return json(200, {
          code: CODE,
          overridePrice: null,
          remainingTickets: 1,
          event: { ...event, registrationForm: [redeemed ? turno : origem] },
        });
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByTestId("input-partner-company"), "Laboratorio Asunción");
    await user.type(screen.getByTestId("input-occupation"), "Farmacéutico");
    await user.click(screen.getByRole("radio", { name: "Instagram" }));
    await user.click(screen.getByTestId("button-redeem"));

    expect(await screen.findByText("Turno preferido")).toBeInTheDocument();
    expect(screen.queryByText("Como soube do evento")).not.toBeInTheDocument();
  });

  it("blocks a blank required question with an inline error", async () => {
    authState.user = { email: "juan@example.com", name: "Juan Pérez", phone: "595981123456" };
    const fetchMock = mockRedeem({
      id: EVENT_ID,
      title: "Webinar CDPI",
      modality: "online",
      registrationForm: [origem],
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByTestId("input-partner-company"), "Laboratorio Asunción");
    await user.type(screen.getByTestId("input-occupation"), "Farmacéutico");
    await user.click(screen.getByTestId("button-redeem"));

    expect(
      await screen.findByText("Responda a pergunta obrigatória: Como soube do evento"),
    ).toBeInTheDocument();
    expect(redeemBodies(fetchMock)).toEqual([]);
  });

  describe("legacy profile questions", () => {
    const legacyForm = LEGACY_QUESTIONS.map((q) => ({
      id: q.id,
      type: "text" as const,
      label: q.label,
      options: [],
      required: true,
      archived: false,
    }));

    it("does not ask cargo and company twice: only the area is asked, and the account's profile is never sent", async () => {
      authState.user = {
        email: "ana@example.com",
        name: "Ana",
        phone: "595981123456",
        occupation: "Cargo da conta",
        partnerCompany: "Empresa da conta",
        areaOfActivity: "Área da conta",
      };
      const fetchMock = mockRedeem({
        id: EVENT_ID,
        title: "Webinar CDPI",
        modality: "online",
        registrationForm: legacyForm,
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      renderPage();

      await user.type(await screen.findByTestId("input-partner-company"), "Empresa do Convidado");
      await user.type(screen.getByTestId("input-occupation"), "Cargo do Convidado");
      expect(screen.queryByLabelText(/Cargo que ocupa/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Empresa que trabalha/)).not.toBeInTheDocument();
      const area = screen.getByLabelText(/Área de atuação/);
      expect(area).toHaveValue("");
      await user.type(area, "Farmácia");
      await user.click(screen.getByTestId("button-redeem"));

      await waitFor(() => {
        expect(redeemBodies(fetchMock)).toEqual([
          expect.objectContaining({
            partnerCompany: "Empresa do Convidado",
            occupation: "Cargo do Convidado",
            answers: { "legacy-area-of-activity": "Farmácia" },
          }),
        ]);
      });
    });
  });
});
