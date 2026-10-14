import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiRequest = vi.fn();
vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

vi.mock("../../hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import ForgotEmailPage from "../../pages/ForgotEmailPage";
import ForgotPasswordPage from "../../pages/ForgotPasswordPage";
import LoginPage from "../../pages/LoginPage";

vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
  useSearch: () => "",
}));

function renderWith(node: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
}

function respond(body: unknown) {
  apiRequest.mockResolvedValue({ json: async () => body });
}

describe("ForgotEmailPage", () => {
  beforeEach(() => apiRequest.mockReset());

  it("masks the CPF input and looks the account up", async () => {
    respond({ found: true, maskedEmail: "re•••••@ep•••.com.br" });
    const user = userEvent.setup();
    renderWith(<ForgotEmailPage />);

    await user.type(screen.getByLabelText("CPF"), "52998224725");
    expect(screen.getByLabelText("CPF")).toHaveValue("529.982.247-25");
    await user.click(screen.getByRole("button", { name: "Buscar e-mail" }));

    expect(await screen.findByText("re•••••@ep•••.com.br")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("POST", "/api/auth/lookup-email", {
      isForeigner: false,
      cpf: "529.982.247-25",
    });
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Redefinir senha" })).toHaveAttribute("href", "/forgot-password");
  });

  it("does not call the server for an invalid CPF", async () => {
    const user = userEvent.setup();
    renderWith(<ForgotEmailPage />);

    await user.click(screen.getByRole("button", { name: "Buscar e-mail" }));

    expect(await screen.findByTestId("text-cpf-error")).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("searches by passport for a foreigner", async () => {
    respond({ found: true, maskedEmail: "vi•••••@ab•••.example" });
    const user = userEvent.setup();
    renderWith(<ForgotEmailPage />);

    await user.click(screen.getByLabelText("Sou estrangeiro / I'm a foreign visitor"));
    await user.type(screen.getByLabelText("Passaporte / Passport"), "zz1234567");
    await user.click(screen.getByRole("button", { name: "Buscar e-mail" }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("POST", "/api/auth/lookup-email", {
        isForeigner: true,
        foreignDocument: "ZZ1234567",
      }),
    );
    expect(await screen.findByText("vi•••••@ab•••.example")).toBeInTheDocument();
  });

  it("explains a missing account and offers to create one", async () => {
    respond({ found: false });
    const user = userEvent.setup();
    renderWith(<ForgotEmailPage />);

    await user.type(screen.getByLabelText("CPF"), "52998224725");
    await user.click(screen.getByRole("button", { name: "Buscar e-mail" }));

    expect(await screen.findByText("Não encontramos uma conta com este CPF.")).toBeInTheDocument();
    expect(screen.getByText(/contas criadas recentemente/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Criar conta" })).toHaveAttribute("href", "/register");
  });
});

describe("links to Esqueci meu e-mail", () => {
  it("is on the login page", () => {
    renderWith(<LoginPage />);
    expect(screen.getByRole("link", { name: "Esqueci meu e-mail" })).toHaveAttribute("href", "/forgot-email");
  });

  it("is on the forgot-password page", () => {
    renderWith(<ForgotPasswordPage />);
    expect(screen.getByRole("link", { name: "Esqueci meu e-mail" })).toHaveAttribute("href", "/forgot-email");
  });
});
