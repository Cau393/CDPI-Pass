import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import SiteFooter from "../../components/SiteFooter";
import { CONTACT_EMAIL } from "@shared/contact";

describe("SiteFooter", () => {
  it("labels the contact column Fale conosco", () => {
    render(<SiteFooter />);

    expect(
      screen.getByRole("heading", { name: "Fale conosco" }),
    ).toBeInTheDocument();
  });

  it("shows the support email", () => {
    render(<SiteFooter />);

    expect(screen.getByText(CONTACT_EMAIL)).toBeInTheDocument();
  });

  it("shows the landline", () => {
    render(<SiteFooter />);

    expect(screen.getByText(/3636-9909/)).toBeInTheDocument();
  });

  it("shows both WhatsApp numbers", () => {
    render(<SiteFooter />);

    expect(screen.getByText(/99865-5500/)).toBeInTheDocument();
    expect(screen.getByText(/99610-1694/)).toBeInTheDocument();
  });

  it("does not show the retired site number", () => {
    const { container } = render(<SiteFooter />);

    expect(container.textContent).not.toContain("99860-6833");
  });

  it("marks the footer for tests and assistive tech", () => {
    render(<SiteFooter />);

    expect(screen.getByTestId("site-footer")).toBeInTheDocument();
  });
});
