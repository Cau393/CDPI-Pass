import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const setLocation = vi.fn();
vi.mock("wouter", () => ({
  useLocation: () => ["/verify-email", setLocation],
}));

const toast = vi.fn();
vi.mock("../../hooks/use-toast", () => ({
  useToast: () => ({ toast }),
}));

const apiRequest = vi.fn();
vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...a: unknown[]) => apiRequest(...a),
  queryClient: { invalidateQueries: vi.fn() },
}));

import VerifyEmailPage from "../../pages/VerifyEmailPage";

function withToken(token: string | null) {
  window.history.replaceState({}, "", token ? `/verify-email?token=${token}` : "/verify-email");
}

function ok(body: unknown) {
  apiRequest.mockResolvedValue({ json: async () => body });
}

beforeEach(() => {
  vi.clearAllMocks();
  apiRequest.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
});

describe("VerifyEmailPage", () => {
  it("shows 'E-mail confirmado' and redirects to /login for an account that has a password", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    withToken("abc");
    ok({ message: "Email verificado com sucesso! Você já pode fazer login.", passwordSet: true });
    render(<VerifyEmailPage />);

    expect(await screen.findByRole("heading", { name: "E-mail confirmado" })).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("GET", "/api/auth/verify-email?token=abc");
    expect(screen.getByTestId("button-go-to-login")).toBeInTheDocument();
    expect(setLocation).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(setLocation).toHaveBeenCalledWith("/login");
  });

  it("keeps the /login redirect when an older server omits passwordSet", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    withToken("abc");
    ok({ message: "ok" });
    render(<VerifyEmailPage />);

    await screen.findByRole("heading", { name: "E-mail confirmado" });
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(setLocation).toHaveBeenCalledWith("/login");
  });

  it("offers 'Crie sua senha' and does not redirect to /login when the row has no password", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    withToken("abc");
    ok({ message: "ok", passwordSet: false });
    render(<VerifyEmailPage />);

    expect(await screen.findByRole("heading", { name: "E-mail confirmado" })).toBeInTheDocument();
    expect(screen.queryByTestId("button-go-to-login")).not.toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(setLocation).not.toHaveBeenCalledWith("/login");

    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(
      screen.getByRole("button", { name: "Crie sua senha" }),
    );
    expect(setLocation).toHaveBeenCalledWith("/forgot-password");
  });

  it("turns the 409 password_reset_required into 'Crie sua senha' with the server message", async () => {
    withToken("abc");
    const message = "Para ver seus ingressos, crie uma nova senha pelo link que enviamos para o seu e-mail.";
    apiRequest.mockRejectedValue(new Error(`409: ${JSON.stringify({ code: "password_reset_required", message })}`));
    render(<VerifyEmailPage />);

    expect(await screen.findByRole("heading", { name: "Crie sua senha" })).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText(/^409:/)).not.toBeInTheDocument();
    expect(screen.queryByText("Erro na Verificação")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Crie sua senha" }));
    expect(setLocation).toHaveBeenCalledWith("/forgot-password");
  });

  it("shows the server message for an invalid token, never the raw status string", async () => {
    withToken("bad");
    apiRequest.mockRejectedValue(new Error(`400: ${JSON.stringify({ message: "Token de verificação expirado ou inválido" })}`));
    render(<VerifyEmailPage />);

    expect(await screen.findByRole("heading", { name: "Erro na Verificação" })).toBeInTheDocument();
    expect(screen.getByText("Token de verificação expirado ou inválido")).toBeInTheDocument();
    expect(screen.queryByText(/^400:/)).not.toBeInTheDocument();
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
  });

  it("shows an error when the link has no token", async () => {
    withToken(null);
    render(<VerifyEmailPage />);

    expect(await screen.findByText("Token de verificação não encontrado")).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
