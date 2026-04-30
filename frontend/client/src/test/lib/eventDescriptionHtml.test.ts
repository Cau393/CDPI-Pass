import { describe, it, expect } from "vitest";
import {
  eventDescriptionPlainText,
  hasMeaningfulEventDescription,
  normalizeDescriptionForEditor,
  sanitizeEventDescriptionHtml,
} from "../../lib/eventDescriptionHtml";

describe("eventDescriptionHtml", () => {
  it("sanitizes to allowed tags only", () => {
    const dirty = '<p>a<script>alert(1)</script><img src=x onerror=alert(1)></p>';
    expect(sanitizeEventDescriptionHtml(dirty)).toBe("<p>a</p>");
  });

  it("normalizes plain text to paragraphs", () => {
    expect(normalizeDescriptionForEditor("Hello")).toBe("<p>Hello</p>");
    expect(normalizeDescriptionForEditor("A\n\nB")).toBe("<p>A</p><p>B</p>");
  });

  it("extracts plain text for search", () => {
    expect(eventDescriptionPlainText("<p><strong>Hi</strong> there</p>")).toBe("Hi there");
  });

  it("detects empty rich content", () => {
    expect(hasMeaningfulEventDescription("<p></p>")).toBe(false);
    expect(hasMeaningfulEventDescription("<p>x</p>")).toBe(true);
  });
});
