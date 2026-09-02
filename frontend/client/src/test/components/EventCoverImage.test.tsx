import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import EventCoverImage from "../../components/EventCoverImage";

const SRC = "https://cdn.example.com/covers/poster.webp";
const ALT = "Workshop Peptídeos";

describe("EventCoverImage", () => {
  it("renders a foreground image with the given src and alt", () => {
    render(<EventCoverImage src={SRC} alt={ALT} />);

    const foreground = screen.getByRole("img", { name: ALT });
    expect(foreground).toHaveAttribute("src", SRC);
  });

  it("fits the foreground with object-contain so the poster is not stretched", () => {
    render(<EventCoverImage src={SRC} alt={ALT} />);

    expect(screen.getByRole("img", { name: ALT })).toHaveClass("object-contain");
  });

  it("never uses object-fill on the foreground image", () => {
    render(<EventCoverImage src={SRC} alt={ALT} />);

    expect(screen.getByRole("img", { name: ALT })).not.toHaveClass("object-fill");
  });

  it("renders an aria-hidden backdrop image with the same src", () => {
    const { container } = render(<EventCoverImage src={SRC} alt={ALT} />);

    const backdrop = container.querySelector('img[aria-hidden="true"]');
    expect(backdrop).toHaveAttribute("src", SRC);
  });

  it("fills the backdrop with a blurred object-cover copy", () => {
    const { container } = render(<EventCoverImage src={SRC} alt={ALT} />);

    const backdrop = container.querySelector('img[aria-hidden="true"]');
    expect(backdrop).toHaveClass("object-cover");
    expect(backdrop?.className).toMatch(/blur/);
  });

  it("loads the hero eagerly with high fetch priority when priority is set", () => {
    render(<EventCoverImage src={SRC} alt={ALT} priority />);

    const foreground = screen.getByRole("img", { name: ALT });
    expect(foreground).toHaveAttribute("loading", "eager");
    expect(foreground).toHaveAttribute("fetchpriority", "high");
  });

  it("lazy-loads the image when it is not the LCP hero", () => {
    render(<EventCoverImage src={SRC} alt={ALT} />);

    expect(screen.getByRole("img", { name: ALT })).toHaveAttribute(
      "loading",
      "lazy",
    );
  });

  it("renders the fallback and no images when src is missing", () => {
    render(
      <EventCoverImage
        src={null}
        alt={ALT}
        fallback={<p>Evento</p>}
      />,
    );

    expect(screen.getByText("Evento")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
