import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
