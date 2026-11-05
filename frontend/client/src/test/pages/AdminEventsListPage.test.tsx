import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const toastSpy = vi.fn();
vi.mock("../../hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }) }));
vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import AdminEventsListPage from "../../pages/AdminEventsListPage";
import { getQueryFn } from "../../lib/queryClient";

const EVENT_ID = "33333333-3333-4333-8333-333333333333";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify([
          { id: EVENT_ID, title: "Congresso CDPI", description: "", location: "SP", date: "2026-09-03T12:00:00.000Z" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminEventsListPage />
    </QueryClientProvider>,
  );
}

describe("AdminEventsListPage — Copiar link menu", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("offers one item per lead tag and copies the exact tagged URL", async () => {
    const writeText = vi.fn(async () => {});
    const user = userEvent.setup();
    // userEvent.setup installs its own clipboard stub: spy on it after setup.
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);
    renderPage();

    const expected: Array<[string, string]> = [
      ["E-mail", "email"],
      ["Parceiros", "parceiros"],
      ["Patrocinado", "patrocinado"],
      ["Consultores", "consultores"],
    ];

    for (const [label, tag] of expected) {
      await user.click(await screen.findByRole("button", { name: "Copiar link (Congresso CDPI)" }));
      await user.click(await screen.findByRole("menuitem", { name: label }));
      await waitFor(() =>
        expect(writeText).toHaveBeenLastCalledWith(`${window.location.origin}/event/${EVENT_ID}?tag=${tag}`),
      );
    }
    expect(writeText).toHaveBeenCalledTimes(4);
    expect(toastSpy).toHaveBeenCalledTimes(4);
  });

  it("lists exactly the four tags", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Copiar link (Congresso CDPI)" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["E-mail", "Parceiros", "Patrocinado", "Consultores"]);
  });
});
