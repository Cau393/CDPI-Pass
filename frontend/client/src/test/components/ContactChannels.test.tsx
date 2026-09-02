import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import ContactChannels from "../../components/ContactChannels";
import {
  CONTACT_EMAIL,
  contactMailtoHref,
  contactPhoneHref,
  CONTACT_CHANNELS,
} from "@shared/contact";

describe("ContactChannels — footer", () => {
  it("links the support email with mailto", () => {
    render(<ContactChannels variant="footer" />);

    expect(
      screen.getByRole("link", { name: CONTACT_EMAIL }),
    ).toHaveAttribute("href", contactMailtoHref());
  });

  it("links the landline with tel", () => {
    render(<ContactChannels />);

    const landline = CONTACT_CHANNELS[0];
    expect(
      screen.getByRole("link", { name: `Telefone ${landline.display}` }),
    ).toHaveAttribute("href", contactPhoneHref(landline));
  });

  it("opens the primary WhatsApp number in a new tab", () => {
    render(<ContactChannels />);

    const whatsapp = CONTACT_CHANNELS[1];
    const link = screen.getByRole("link", {
      name: `WhatsApp ${whatsapp.display}`,
    });
    expect(link).toHaveAttribute("href", contactPhoneHref(whatsapp));
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("does not show the retired site number", () => {
    const { container } = render(<ContactChannels />);

    expect(container.textContent).not.toContain("99860-6833");
  });

  it("keeps each channel at a 44px tap target", () => {
    render(<ContactChannels variant="footer" />);

    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveClass("min-h-11");
    }
  });
});

describe("ContactChannels — inline", () => {
  it("still exposes the support email as a mailto link", () => {
    render(<ContactChannels variant="inline" />);

    expect(
      screen.getByRole("link", { name: CONTACT_EMAIL }),
    ).toHaveAttribute("href", contactMailtoHref());
  });

  it("does not force a new tab on the landline", () => {
    render(<ContactChannels variant="inline" />);

    const landline = CONTACT_CHANNELS[0];
    expect(
      screen.getByRole("link", { name: `Telefone ${landline.display}` }),
    ).not.toHaveAttribute("target");
  });
});
