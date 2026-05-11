import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminPrintTerminalPage from "../../pages/AdminPrintTerminalPage";
import * as webUsbZebra from "@/lib/webUsbZebra";
import * as queryClient from "@/lib/queryClient";
import type { Event } from "@shared/schema";

const mockEvent: Event = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Evento",
  description: "",
  date: new Date("2026-01-01"),
  location: "SP",
  price: "0",
  imageUrl: null,
  maxAttendees: 100,
  currentAttendees: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  certificateTemplateUrl: null,
  courtesyTemplate: null,
  courtesyEmailSubject: null,
};

vi.mock("@/components/admin/EventSelector", () => ({
  default: function MockEventSelector({
    onSelect,
  }: {
    onSelect: (e: Event) => void;
  }) {
    return (
      <button
        type="button"
        data-testid="select-event"
        onClick={() => onSelect(mockEvent)}
      >
        Selecionar
      </button>
    );
  },
}));

const apiRequest = vi.fn();

vi.mock("@/lib/queryClient", async (importOriginal) => {
  const mod = await importOriginal<typeof queryClient>();
  return {
    ...mod,
    apiRequest: (...a: unknown[]) => apiRequest(...(a as [string, string, unknown?])),
  };
});

const wsInstances: { send: (s: string) => void; close: () => void; url: string }[] = [];

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  url: string;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
    const self = this;
    wsInstances.push({
      url,
      send(s: string) {
        // no-op: tests can inspect via spy if needed
        void s;
      },
      close() {
        self.readyState = MockWebSocket.CLOSED;
        self.onclose?.();
      },
    });
    queueMicrotask(() => {
      this.onopen?.();
    });
  }
  send(data: string) {
    wsInstances.at(-1)?.send(data);
  }
  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AdminPrintTerminalPage />
    </QueryClientProvider>,
  );
}

describe("AdminPrintTerminalPage", () => {
  const requestDevice = vi.fn();
  const transferOut = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("token", "t");
    wsInstances.length = 0;
    (globalThis as { WebSocket?: unknown }).WebSocket = MockWebSocket as unknown as typeof WebSocket;
    (navigator as { usb?: USB }).usb = {
      requestDevice,
      addEventListener: () => {
        // stub
      },
      removeEventListener: () => {
        // stub
      },
    } as unknown as USB;

    const device = {
      open: vi.fn().mockResolvedValue(undefined),
      selectConfiguration: vi.fn().mockResolvedValue(undefined),
      claimInterface: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      configuration: { configurationValue: 1 } as USBConfiguration,
      configurations: [{ configurationValue: 1 }],
    } as unknown as USBDevice;
    (device as USBDevice & { _impl: object })._impl = device;

    requestDevice.mockResolvedValue(device);
    vi.spyOn(webUsbZebra, "isWebUsbSupported").mockReturnValue(true);
    vi.spyOn(webUsbZebra, "connectZebraZD220Like").mockImplementation(async () => {
      await navigator.usb.requestDevice({ filters: [{ vendorId: 0x0a5f }] });
      return {
        device,
        printZpl: async (bytes: Uint8Array) => {
          void bytes;
          await transferOut();
        },
        close: async () => {
          await (device as { close: () => Promise<void> }).close();
        },
      };
    });
    apiRequest.mockImplementation(
      (method: string, url: string) => {
        if (method === "GET" && url.includes("print-history")) {
          return Promise.resolve({
            json: () =>
              Promise.resolve({
                data: [
                  {
                    id: "j1",
                    orderId: "o1",
                    displayName: "Test Name",
                    companyLine: null,
                    status: "completed",
                    attempts: 1,
                    lastErrorCode: null,
                    lastErrorMessage: null,
                    createdAt: new Date().toISOString(),
                    completedAt: new Date().toISOString(),
                  },
                ],
              }),
          } as Response);
        }
        return Promise.reject(new Error("unexpected " + method + " " + url));
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Conectar Impressora only triggers USB pairing on click", async () => {
    renderPage();
    const btn = screen.getByRole("button", { name: /conectar impressora/i });
    expect(requestDevice).not.toHaveBeenCalled();
    fireEvent.click(btn);
    await waitFor(() => {
      expect(requestDevice).toHaveBeenCalledTimes(1);
    });
  });

  it("sends printer_ready on WebSocket only after USB session exists", async () => {
    const sendSpy = vi
      .spyOn(MockWebSocket.prototype, "send")
      .mockImplementation(function (this: MockWebSocket, data: string) {
        // capture
        void data;
      });
    renderPage();
    fireEvent.click(screen.getByTestId("select-event"));
    await waitFor(() => {
      expect(wsInstances.length).toBeGreaterThan(0);
    });
    const anyReadyBeforeUsb = sendSpy.mock.calls.some((c) =>
      String(c[0]).includes("printer_ready"),
    );
    expect(anyReadyBeforeUsb).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /conectar impressora/i }));
    await waitFor(
      () => {
        const hasReady = sendSpy.mock.calls.some((c) =>
          String(c[0]).includes("printer_ready"),
        );
        expect(hasReady).toBe(true);
      },
      { timeout: 3000 },
    );
  });

  it("shows manual print tab in Portuguese and disables print until USB", async () => {
    const user = userEvent.setup();
    renderPage();
    fireEvent.click(screen.getByTestId("select-event"));
    expect(
      screen.getByRole("tab", { name: "Impressão manual" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Fila e histórico" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Impressão manual" }));
    const manualPrintBtn = await screen.findByRole("button", {
      name: /imprimir etiqueta/i,
    });
    expect(manualPrintBtn).toBeDisabled();
  });

  it("manual print sends ZPL after USB when form is filled", async () => {
    const user = userEvent.setup();
    renderPage();
    fireEvent.click(screen.getByTestId("select-event"));
    await user.click(screen.getByRole("tab", { name: "Impressão manual" }));
    const nameInput = await screen.findByPlaceholderText(
      "Nome completo do participante",
    );
    fireEvent.click(screen.getByRole("button", { name: /conectar impressora/i }));
    await waitFor(() => {
      expect(webUsbZebra.connectZebraZD220Like).toHaveBeenCalled();
    });
    fireEvent.change(nameInput, { target: { value: "Ana Clara Costa" } });
    const companyInput = screen.getByPlaceholderText("Empresa ou cargo");
    fireEvent.change(companyInput, { target: { value: "ACME" } });
    expect(screen.getByRole("button", { name: /imprimir etiqueta/i })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /imprimir etiqueta/i }));
    await waitFor(() => {
      expect(transferOut).toHaveBeenCalled();
    });
  });

  it("reprint calls local printZpl and does not POST new print jobs", async () => {
    const postSpy = vi.fn();
    apiRequest.mockImplementation(
      (method: string, url: string) => {
        if (method === "GET" && url.includes("print-history")) {
          return Promise.resolve({
            json: () =>
              Promise.resolve({
                data: [
                  {
                    id: "j1",
                    orderId: "o1",
                    displayName: "Só local",
                    companyLine: null,
                    status: "completed",
                    attempts: 1,
                    lastErrorCode: null,
                    lastErrorMessage: null,
                    createdAt: new Date().toISOString(),
                    completedAt: new Date().toISOString(),
                  },
                ],
              }),
          } as Response);
        }
        if (method === "POST") {
          postSpy(method, url);
        }
        return Promise.reject(new Error("unexpected " + method + " " + url));
      },
    );
    renderPage();
    fireEvent.click(screen.getByTestId("select-event"));
    await screen.findByText("Só local");
    fireEvent.click(screen.getByRole("button", { name: /conectar impressora/i }));
    await waitFor(() => {
      expect(webUsbZebra.connectZebraZD220Like).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole("button", { name: /imprimir novamente/i }));
    await waitFor(() => {
      expect(transferOut).toHaveBeenCalled();
    });
    expect(postSpy).not.toHaveBeenCalled();
  });
});
