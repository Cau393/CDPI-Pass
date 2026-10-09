import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Event } from "@shared/schema";

const authState: { user: { isForeigner: boolean; cpf?: string | null } } = { user: { isForeigner: false, cpf: "52998224725" } };
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.user, isAuthenticated: true }),
}));
vi.mock("../../hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/", vi.fn()] }));

import { useFreeSubscribe } from "../../hooks/useFreeSubscribe";
import { queryClient as appQueryClient } from "../../lib/queryClient";

const event = {
  id: "55555555-5555-5555-5555-555555555555",
  title: "Workshop",
  isFree: true,
  modality: "online",
  registrationForm: [],
} as unknown as Event;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

async function subscribeWith400(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status: 400, headers: { "Content-Type": "application/json" } })),
  );
  const invalidate = vi.spyOn(appQueryClient, "invalidateQueries").mockResolvedValue();
  const { result } = renderHook(() => useFreeSubscribe(), { wrapper });
  act(() => result.current.subscribe(event));
  await waitFor(() => expect(invalidate).toHaveBeenCalled());
  return invalidate.mock.calls.map(([filters]) => (filters as { queryKey: unknown[] }).queryKey);
}

describe("useFreeSubscribe — stale cached event", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refetches the event and the account on identity_required", async () => {
    const keys = await subscribeWith400({ code: "identity_required", missing: ["address"], message: "Complete seus dados" });

    expect(keys).toContainEqual([`/api/events/${event.id}`]);
    expect(keys).toContainEqual(["/api/auth/me"]);
  });

  it("refetches the event when the answers target an archived or unknown question", async () => {
    const keys = await subscribeWith400({ message: "Resposta para uma pergunta que não existe neste evento." });

    expect(keys).toContainEqual([`/api/events/${event.id}`]);
    expect(keys).not.toContainEqual(["/api/auth/me"]);
  });
});

describe("useFreeSubscribe — list page with a form the admin changed", () => {
  const oldQuestion = { id: "q-old", type: "text", label: "Pergunta antiga", options: [], required: false, archived: false };
  const newQuestion = { id: "q-new", type: "text", label: "Pergunta nova", options: [], required: false, archived: false };
  const listEvent = { ...event, registrationForm: [oldQuestion] } as unknown as Event;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    appQueryClient.clear();
  });

  function Harness() {
    const { subscribe, registrationDialog } = useFreeSubscribe();
    return (
      <>
        <button onClick={() => subscribe(listEvent)}>abrir</button>
        {registrationDialog}
      </>
    );
  }

  it("refetches the list and the event and shows the new question in the open dialog", async () => {
    appQueryClient.setQueryData(["/api/events"], [listEvent]);
    const invalidate = vi.spyOn(appQueryClient, "invalidateQueries");
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/subscribe") && init?.method === "POST") {
          return json(400, { message: "Resposta para uma pergunta que não existe neste evento." });
        }
        return json(200, { ...event, registrationForm: [newQuestion] });
      }),
    );
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={appQueryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    await user.click(screen.getByText("abrir"));
    expect(await screen.findByLabelText("Pergunta antiga")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar inscrição" }));

    expect(await screen.findByLabelText("Pergunta nova")).toBeInTheDocument();
    expect(screen.queryByLabelText("Pergunta antiga")).not.toBeInTheDocument();
    const keys = invalidate.mock.calls.map(([filters]) => (filters as { queryKey: unknown[] }).queryKey);
    expect(keys).toContainEqual(["/api/events"]);
  });
});
