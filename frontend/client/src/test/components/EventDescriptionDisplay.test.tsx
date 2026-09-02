import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import EventDescriptionDisplay from "../../components/EventDescriptionDisplay";

describe("EventDescriptionDisplay", () => {
  it("renders a blank paragraph where the editor showed a trailing line break", () => {
    const { container } = render(
      <EventDescriptionDisplay html="<p>Primeira<br /></p><p>Segunda</p>" />,
    );

    expect(container.querySelectorAll("p")).toHaveLength(3);
  });

  it("puts the blank paragraph between the two lines", () => {
    const { container } = render(
      <EventDescriptionDisplay html="<p>Primeira<br /></p><p>Segunda</p>" />,
    );

    expect(container.querySelectorAll("p")[1].textContent).toBe("");
  });

  it("gives blank paragraphs an em-based height so older iOS Safari (no lh unit) shows them", () => {
    const { container } = render(<EventDescriptionDisplay html="<p>A</p><p></p><p>B</p>" />);

    expect(container.firstElementChild).toHaveClass("[&_p:empty]:min-h-[1.3em]");
  });

  it("renders nothing for an empty description", () => {
    const { container } = render(<EventDescriptionDisplay html="<p></p>" />);

    expect(container.firstElementChild).toBeNull();
  });
});
