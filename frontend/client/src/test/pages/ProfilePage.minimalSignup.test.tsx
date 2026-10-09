import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("wouter", () => ({
  useLocation: () => ["/profile", vi.fn()],
}));

// An account created by the ADR-016 four-field signup: no document, birth
// date or address, and the DB default "Nao aplicavel" on the work fields.
// Same instance every render (the page resets its form on identity change).
const NEW_ACCOUNT = {
  id: "u-new",
  name: "Pedro Gómez",
  email: "pedro@example.com",
  phone: "595981123456",
  cpf: null,
  isForeigner: false,
  foreignDocument: null,
  birthDate: null,
  address: null,
  occupation: "Nao aplicavel",
  partnerCompany: "Nao aplicavel",
  areaOfActivity: "Nao aplicavel",
  isAdmin: false,
};
const AUTH: { isAuthenticated: boolean; isLoading: boolean; user: Record<string, unknown> } = {
  isAuthenticated: true,
  isLoading: false,
  user: NEW_ACCOUNT,
};
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => AUTH,
}));

vi.mock("../../hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("../../components/CertificatesTab", () => ({
  CertificatesTab: () => <div data-testid="certificates-tab" />,
}));

const apiRequest = vi.fn();
vi.mock("@/lib/queryClient", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/queryClient")>();
  return {
    ...actual,
    apiRequest: (...a: Parameters<typeof actual.apiRequest>) => apiRequest(...a),
  };
});

import ProfilePage from "../../pages/ProfilePage";

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
}

async function openProfileTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ProfilePage />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByTestId("tab-profile"));
  return user;
}

function profilePutBody() {
  const call = apiRequest.mock.calls.find(([method, url]) => method === "PUT" && url === "/api/profile");
  return call?.[2] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  AUTH.user = NEW_ACCOUNT;
  localStorage.setItem("token", "t");
  apiRequest.mockImplementation(async (_method: string, url: string) =>
    String(url).startsWith("/api/orders") ? jsonResponse({ orders: [], totalPages: 1 }) : jsonResponse({}),
  );
});

describe("ProfilePage — account from the four-field signup (ADR-016 Phase 4)", () => {
  it("shows the 'Nao aplicavel' defaults and the missing address as empty fields", async () => {
    await openProfileTab();

    expect(screen.getByTestId("input-profile-address")).toHaveValue("");
    expect(screen.getByTestId("input-profile-occupation")).toHaveValue("");
    expect(screen.getByTestId("input-profile-cpf")).toHaveAttribute("placeholder", "Informado na primeira inscrição");
  });

  it("saves without sending the missing address or birth date, keeping the work-field defaults", async () => {
    const user = await openProfileTab();

    await user.click(screen.getByRole("button", { name: "Salvar Alterações" }));

    await waitFor(() => expect(profilePutBody()).toBeDefined());
    const body = profilePutBody()!;
    expect(body).not.toHaveProperty("address");
    expect(body).not.toHaveProperty("birthDate");
    expect(body).toMatchObject({
      name: "Pedro Gómez",
      email: "pedro@example.com",
      phone: "595981123456",
      occupation: "Nao aplicavel",
      partnerCompany: "Nao aplicavel",
      areaOfActivity: "Nao aplicavel",
    });
  });

  it("clears a filled work field to the default instead of silently keeping the old value", async () => {
    AUTH.user = { ...NEW_ACCOUNT, occupation: "Analista" };
    const user = await openProfileTab();

    await user.clear(screen.getByTestId("input-profile-occupation"));
    await user.click(screen.getByRole("button", { name: "Salvar Alterações" }));

    await waitFor(() => expect(profilePutBody()).toBeDefined());
    expect(profilePutBody()).toMatchObject({ occupation: "Nao aplicavel" });
  });

  it("still sends a blanked existing address, so the server can refuse it", async () => {
    AUTH.user = { ...NEW_ACCOUNT, address: "Av. España 1000, Asunción" };
    const user = await openProfileTab();

    await user.clear(screen.getByTestId("input-profile-address"));
    await user.click(screen.getByRole("button", { name: "Salvar Alterações" }));

    await waitFor(() => expect(profilePutBody()).toBeDefined());
    expect(profilePutBody()).toMatchObject({ address: "" });
  });

  it("sends a work field once the person fills it in", async () => {
    const user = await openProfileTab();

    await user.type(screen.getByTestId("input-profile-occupation"), "Farmacêutico");
    await user.click(screen.getByRole("button", { name: "Salvar Alterações" }));

    await waitFor(() => expect(profilePutBody()).toBeDefined());
    expect(profilePutBody()).toMatchObject({ occupation: "Farmacêutico" });
  });
});
