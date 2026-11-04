import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let search = "";
const setLocation = vi.fn();
vi.mock("wouter", () => ({
  useLocation: () => ["/login", setLocation],
  useSearch: () => search,
}));

vi.mock("../../hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import LoginPage from "../../pages/LoginPage";

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LoginPage />
    </QueryClientProvider>,
  );
}

describe("LoginPage sign-up button", () => {
  beforeEach(() => {
    search = "";
  });

  it("offers a Criar conta button that opens the register page", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Criar conta" })).toHaveAttribute(
      "href",
      "/register",
    );
  });

  it("keeps the return path when the visitor came from an event", () => {
    search = "?next=%2Fevent%2Fabc";
    renderPage();
    expect(screen.getByRole("link", { name: "Criar conta" })).toHaveAttribute(
      "href",
      "/register?next=%2Fevent%2Fabc",
    );
  });

  it("drops a next that is not a valid return target", () => {
    search = "?next=https%3A%2F%2Fevil.example";
    renderPage();
    expect(screen.getByRole("link", { name: "Criar conta" })).toHaveAttribute(
      "href",
      "/register",
    );
  });
});

describe("LoginPage — unverified account", () => {
  beforeEach(() => {
    search = "?next=%2Fevent%2Fabc";
    setLocation.mockReset();
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ token: "jwt-login", user: { id: "u1", email: "maria@example.com", name: "Maria", emailVerified: false } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("goes straight to next (not /verify-email) and stores the token", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByTestId("input-email"), "maria@example.com");
    await user.type(screen.getByTestId("input-password"), "secret1");
    await user.click(screen.getByTestId("button-login"));

    await waitFor(() => expect(setLocation).toHaveBeenCalledWith("/event/abc"));
    expect(setLocation).not.toHaveBeenCalledWith(expect.stringContaining("/verify-email"));
    expect(localStorage.getItem("token")).toBe("jwt-login");
  });
});
