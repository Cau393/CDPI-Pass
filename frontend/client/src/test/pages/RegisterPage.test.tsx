import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("wouter", () => ({
  useLocation: () => ["/register", vi.fn()],
  useSearch: () => "",
}));

vi.mock("../../hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import RegisterPage from "../../pages/RegisterPage";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RegisterPage />
    </QueryClientProvider>,
  );
}

describe("RegisterPage — document", () => {
  it("asks a foreign visitor for the passport instead of the CPF", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByLabelText("Sou estrangeiro / I'm a foreign visitor"));
    await user.type(screen.getByLabelText("Passaporte / Passport"), "ab123456");

    expect(screen.getByTestId("input-foreign-document")).toHaveValue("AB123456");
  });
});
