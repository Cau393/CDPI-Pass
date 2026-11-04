import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const setLocation = vi.fn();
let search = "";
vi.mock("wouter", () => ({
  useLocation: () => ["/register", setLocation],
  useSearch: () => search,
}));

const toastSpy = vi.fn();
vi.mock("../../hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

import RegisterPage from "../../pages/RegisterPage";

const fetchMock = vi.fn();

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RegisterPage />
    </QueryClientProvider>,
  );
}

async function fillSignup(user: ReturnType<typeof userEvent.setup>, email: string, nationalPhone: string) {
  await user.type(screen.getByTestId("input-name"), "Maria Silva");
  await user.type(screen.getByTestId("input-email"), email);
  await user.type(screen.getByTestId("input-email-confirm"), email);
  await user.click(screen.getByTestId("input-phone"));
  await user.keyboard("{End}");
  await user.type(screen.getByTestId("input-phone"), nationalPhone);
  await user.type(screen.getByTestId("input-password"), "secret1");
  await user.type(screen.getByTestId("input-password-confirm"), "secret1");
  await user.click(screen.getByTestId("checkbox-terms"));
}

function sentBody() {
  const [, init] = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/auth/register"))!;
  return JSON.parse(String(init.body));
}

beforeEach(() => {
  localStorage.clear();
  search = "";
  setLocation.mockReset();
  toastSpy.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ message: "ok", token: "jwt-new", user: { id: "u1", email: "maria@example.com", name: "Maria Silva", emailVerified: false } }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RegisterPage — minimal signup (ADR-016 Phase 4)", () => {
  it("asks only name, e-mail, phone and password; no document, birth date, address or work fields", () => {
    renderPage();

    for (const testId of ["input-name", "input-email", "input-email-confirm", "input-phone", "input-password", "input-password-confirm", "checkbox-terms"]) {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    }
    for (const testId of [
      "input-cpf",
      "checkbox-foreigner",
      "input-foreign-document",
      "input-birth-date",
      "input-address",
      "input-occupation",
      "input-partner-company",
      "input-area-of-activity",
    ]) {
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
    }
  });

  it("sends exactly the four fields, stores the token and goes to ?next= without any verification step", async () => {
    search = "next=%2Fevent%2Fabc";
    const user = userEvent.setup();
    renderPage();

    await fillSignup(user, "maria@example.com", "61987654321");
    await user.click(screen.getByTestId("button-register"));

    await waitFor(() => expect(setLocation).toHaveBeenCalled());
    expect(sentBody()).toEqual({
      name: "Maria Silva",
      email: "maria@example.com",
      phone: "5561987654321",
      password: "secret1",
    });
    expect(localStorage.getItem("token")).toBe("jwt-new");
    expect(setLocation).toHaveBeenCalledWith("/event/abc");
  });

  it("goes to / when there is no next", async () => {
    const user = userEvent.setup();
    renderPage();

    await fillSignup(user, "maria@example.com", "61987654321");
    await user.click(screen.getByTestId("button-register"));

    await waitFor(() => expect(setLocation).toHaveBeenCalledWith("/"));
    expect(localStorage.getItem("token")).toBe("jwt-new");
  });

  it("lets a foreign visitor sign up with a Paraguay phone and no document", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.selectOptions(container.querySelector("select.PhoneInputCountrySelect")!, "PY");
    await fillSignup(user, "pedro@example.com", "981123456");
    await user.click(screen.getByTestId("button-register"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody()).toEqual({
      name: "Maria Silva",
      email: "pedro@example.com",
      phone: "595981123456",
      password: "secret1",
    });
  });

  it("does not submit without the phone, and still checks the confirmations", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByTestId("input-name"), "Maria Silva");
    await user.type(screen.getByTestId("input-email"), "maria@example.com");
    await user.type(screen.getByTestId("input-email-confirm"), "outra@example.com");
    await user.type(screen.getByTestId("input-password"), "secret1");
    await user.type(screen.getByTestId("input-password-confirm"), "secret2");
    await user.click(screen.getByTestId("checkbox-terms"));
    await user.click(screen.getByTestId("button-register"));

    expect(await screen.findByTestId("text-phone-error")).toBeInTheDocument();
    expect(screen.getByTestId("text-email-confirm-error")).toHaveTextContent("Os e-mails não coincidem");
    expect(screen.getByTestId("text-password-confirm-error")).toHaveTextContent("As senhas não coincidem");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ADR-017 Stage 5 fix: an e-mail that already has guest tickets is a notice, not an error with raw JSON.
describe("RegisterPage — server answers", () => {
  const CLAIM = "Este e-mail já tem ingressos. Enviamos um link para você criar sua senha.";
  const answer = (status: number, body: unknown) =>
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
    );

  it("409 guest_account_claim: a persistent notice with the inbox/spam hint and a login link, no error toast", async () => {
    answer(409, { code: "guest_account_claim", message: CLAIM });
    const user = userEvent.setup();
    renderPage();
    await fillSignup(user, "camila@example.com", "61987654321");
    await user.click(screen.getByTestId("button-register"));

    const notice = await screen.findByTestId("notice-guest-account-claim");
    expect(notice).toHaveTextContent(CLAIM);
    expect(notice).toHaveTextContent(/caixa de entrada.*spam/i);
    expect(notice).not.toHaveTextContent("409");
    expect(notice).not.toHaveTextContent("{");
    expect(notice.getAttribute("role")).toBe("status");
    expect(screen.getByTestId("link-claim-login").getAttribute("href")).toBe("/login");
    expect(toastSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("keeps ?next= on the notice's login link", async () => {
    search = "next=%2Fevent%2Fabc";
    answer(409, { code: "guest_account_claim", message: CLAIM });
    const user = userEvent.setup();
    renderPage();
    await fillSignup(user, "camila@example.com", "61987654321");
    await user.click(screen.getByTestId("button-register"));

    expect((await screen.findByTestId("link-claim-login")).getAttribute("href")).toBe(
      `/login?next=${encodeURIComponent("/event/abc")}`,
    );
  });

  it("other errors toast the server message, never the raw `400: {json}`", async () => {
    answer(400, { message: "Email já cadastrado" });
    const user = userEvent.setup();
    renderPage();
    await fillSignup(user, "maria@example.com", "61987654321");
    await user.click(screen.getByTestId("button-register"));

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ description: "Email já cadastrado" })),
    );
    expect(screen.queryByTestId("notice-guest-account-claim")).toBeNull();
  });
});
