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

  it("shows conditional tema field when interestInTopics is Sim (cdpi_event)", async () => {
    const user = userEvent.setup();

    render(
      <NpsCertificateModal
        event={{ ...baseEvent, npsType: "cdpi_event" }}
        open
        onOpenChange={() => {}}
        onCertificateGenerated={() => {}}
      />,
    );

    expect(
      screen.queryByLabelText(/Descreva o tema abordado que gostaria de se aprofundar/i),
    ).not.toBeInTheDocument();

    const sim = screen.getByRole("radio", { name: /^Sim$/i });
    await user.click(sim);

    expect(
      await screen.findByLabelText(/Descreva o tema abordado que gostaria de se aprofundar/i),
    ).toBeInTheDocument();
  });

  it("renders CDPI Apoiando form without interest topic follow-up", () => {
    render(
      <NpsCertificateModal
        event={{ ...baseEvent, npsType: "cdpi_apoiando" }}
        open
        onOpenChange={() => {}}
        onCertificateGenerated={() => {}}
      />,
    );

    expect(screen.getByText(/CDPI Apoiando Evento/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/pesquisa de satisfação \(Evento do CDPI\)/i),
    ).not.toBeInTheDocument();

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).queryByLabelText(
        /Descreva o tema abordado que gostaria de se aprofundar/i,
      ),
    ).not.toBeInTheDocument();
  });
});
