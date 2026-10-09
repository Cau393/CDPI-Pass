import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
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
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    appQueryClient.clear();
  });

  /** HomePage in miniature: a list consumer plus the subscribe hook's dialog. */
  function Harness() {
    const { subscribe, registrationDialog, isPending } = useFreeSubscribe();
    useQuery<Event[]>({ queryKey: ["/api/events"] });
    return (
      <>
        <button onClick={() => subscribe(listEvent)}>abrir</button>
        <span data-testid="pending">{String(isPending)}</span>
        {registrationDialog}
      </>
    );
  }

  function mount() {
    render(
      <QueryClientProvider client={appQueryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  }

  async function openAndConfirm() {
    const user = userEvent.setup();
    await user.click(screen.getByText("abrir"));
    expect(await screen.findByLabelText("Pergunta antiga")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar inscrição" }));
  }

  const refused = () => json(400, { message: "Resposta para uma pergunta que não existe neste evento." });

  it("refetches the list a second time and shows the new question in the open dialog", async () => {
    const listFetches: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/subscribe") && init?.method === "POST") return refused();
        if (url === "/api/events") {
          listFetches.push(url);
          return json(200, [{ ...event, registrationForm: listFetches.length > 1 ? [newQuestion] : [oldQuestion] }]);
        }
        return json(200, { ...event, registrationForm: [newQuestion] });
      }),
    );
    mount();
    await waitFor(() => expect(listFetches).toHaveLength(1));

    await openAndConfirm();

    expect(await screen.findByLabelText("Pergunta nova")).toBeInTheDocument();
    expect(screen.queryByLabelText("Pergunta antiga")).not.toBeInTheDocument();
    expect(listFetches).toHaveLength(2);
  });

  it("settles the request and shows the error before the event refetch answers", async () => {
    let releaseRefetch: () => void = () => {};
    const gate = new Promise<void>((resolve) => (releaseRefetch = resolve));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/subscribe") && init?.method === "POST") return refused();
        if (url === "/api/events") return json(200, [listEvent]);
        await gate;
        return json(200, { ...event, registrationForm: [newQuestion] });
      }),
    );
    mount();

    await openAndConfirm();

    expect(await screen.findByText(/não existe neste evento/)).toBeInTheDocument();
    expect(screen.getByTestId("pending")).toHaveTextContent("false");
    expect(screen.getByRole("button", { name: "Confirmar inscrição" })).toBeEnabled();
    releaseRefetch();
    expect(await screen.findByLabelText("Pergunta nova")).toBeInTheDocument();
  });

  it("tells the user to reload when the event cannot be refetched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/subscribe") && init?.method === "POST") return refused();
        if (url === "/api/events") return json(200, [listEvent]);
        return json(404, { message: "Evento não encontrado" });
      }),
    );
    mount();

    await openAndConfirm();

    expect(await screen.findByText("Atualize a página para continuar.")).toBeInTheDocument();
    expect(screen.queryByText(/não existe neste evento/)).not.toBeInTheDocument();
  });
});
