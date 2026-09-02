import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NpsCertificateModal } from "@/components/nps/NpsCertificateModal";

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
}));

const baseEvent = {
  eventId: "aeebce8e-16c5-4bd1-8e4e-2c1c8f2f6b01",
  eventName: "Evento Teste",
  eventDate: "2026-06-01T12:00:00.000Z",
  certificateUrl: null as string | null,
};

describe("NpsCertificateModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Outro follow-up when support rating is Outro (cdpi_event)", async () => {
    const user = userEvent.setup();

    render(
      <NpsCertificateModal
        event={{ ...baseEvent, npsType: "cdpi_event" }}
        open
        onOpenChange={() => {}}
        onCertificateGenerated={() => {}}
      />,
    );

    expect(screen.queryByLabelText(/^Descreva/i)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("combobox", {
        name: /Como você avalia o suporte da equipe CDPI durante o evento/i,
      }),
    );
    await user.click(await screen.findByRole("option", { name: "Outro" }));

    expect(await screen.findByLabelText(/^Descreva/i)).toBeInTheDocument();
  });

  it("renders Evento CDPI form with privacy checkbox", () => {
    render(
      <NpsCertificateModal
        event={{ ...baseEvent, npsType: "cdpi_event" }}
        open
        onOpenChange={() => {}}
        onCertificateGenerated={() => {}}
      />,
    );

    expect(screen.getByText(/pesquisa de satisfação \(Evento CDPI\)/i)).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: /Li e concordo com a Política de Privacidade e Consentimento/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders Evento de Terceiros form without CDPI workshop-feeling question", () => {
    render(
      <NpsCertificateModal
        event={{ ...baseEvent, npsType: "cdpi_apoiando" }}
        open
        onOpenChange={() => {}}
        onCertificateGenerated={() => {}}
      />,
    );

    expect(screen.getByText(/Evento de Terceiros/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/pesquisa de satisfação \(Evento CDPI\)/i),
    ).not.toBeInTheDocument();

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).queryByText(/Como você se sentiu participando do nosso Workshop/i),
    ).not.toBeInTheDocument();
  });

  it("shows Outro follow-up on Evento de Terceiros organization question", async () => {
    const user = userEvent.setup();

    render(
      <NpsCertificateModal
        event={{ ...baseEvent, npsType: "cdpi_apoiando" }}
        open
        onOpenChange={() => {}}
        onCertificateGenerated={() => {}}
      />,
    );

    expect(screen.queryByLabelText(/^Descreva/i)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("combobox", {
        name: /Como foi sua experiência com a equipe organizadora/i,
      }),
    );
    await user.click(await screen.findByRole("option", { name: "Outro" }));

    expect(await screen.findByLabelText(/^Descreva/i)).toBeInTheDocument();
  });
});
