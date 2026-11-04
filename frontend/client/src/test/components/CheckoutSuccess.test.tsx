import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const setLocation = vi.fn();
vi.mock("wouter", () => ({ useLocation: () => ["/", setLocation] }));

import { CheckoutSuccess } from "../../components/CheckoutSuccess";

beforeEach(() => setLocation.mockReset());

describe("CheckoutSuccess", () => {
  it("shows the paid headline, the masked e-mail and the order total", () => {
    render(
      <CheckoutSuccess
        variant="paid"
        guest
        email="camila@gmail.com"
        amount="105.00"
        onContinue={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Pagamento confirmado!" })).toBeTruthy();
    expect(screen.getByText(/Ingresso enviado para ca•••••@gm•••\.com/)).toBeTruthy();
    expect(screen.queryByText(/camila@gmail\.com/)).toBeNull();
    expect(screen.getByTestId("text-success-total").textContent).toMatch(/R\$\s*105,00/);
  });

  it("shows the free headline without a total", () => {
    render(
      <CheckoutSuccess variant="free" guest email="camila@gmail.com" onContinue={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByRole("heading", { name: "Inscrição confirmada!" })).toBeTruthy();
    expect(screen.queryByTestId("text-success-total")).toBeNull();
    expect(screen.queryByTestId("link-success-whatsapp")).toBeNull();
  });

  it("shows the WhatsApp group as a plain link in a new tab, never opened on its own", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(
      <CheckoutSuccess
        variant="free"
        guest
        email="camila@gmail.com"
        whatsappGroupUrl="https://chat.whatsapp.com/AbCdEf123"
        onContinue={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const link = screen.getByRole("link", { name: "Entrar no grupo do WhatsApp" });
    expect(link.getAttribute("href")).toBe("https://chat.whatsapp.com/AbCdEf123");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("sends a guest to /forgot-password without the e-mail in the URL, and closes", async () => {
    const onClose = vi.fn();
    const onContinue = vi.fn();
    render(<CheckoutSuccess variant="paid" guest email="a@b.com" onContinue={onContinue} onClose={onClose} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Crie sua senha" }));
    expect(setLocation).toHaveBeenCalledWith("/forgot-password");
    expect(onClose).toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("lets a guest close and stay on the page", async () => {
    const onClose = vi.fn();
    render(<CheckoutSuccess variant="paid" guest email="a@b.com" onContinue={vi.fn()} onClose={onClose} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Fechar" }));
    expect(onClose).toHaveBeenCalled();
    expect(setLocation).not.toHaveBeenCalled();
  });

  it("calls the passed handler for a logged-in buyer and offers no password button", async () => {
    const onContinue = vi.fn();
    render(<CheckoutSuccess variant="free" guest={false} email="a@b.com" onContinue={onContinue} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Crie sua senha" })).toBeNull();
    await userEvent.setup().click(screen.getByTestId("button-success-continue"));
    expect(onContinue).toHaveBeenCalled();
    expect(setLocation).not.toHaveBeenCalled();
  });
});
