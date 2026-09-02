import { describe, it, expect } from "vitest";
import {
  eventDescriptionPlainText,
  hasMeaningfulEventDescription,
  normalizeDescriptionForEditor,
  prepareDescriptionHtmlForDisplay,
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

describe("prepareDescriptionHtmlForDisplay", () => {
  it("turns a trailing line break into a blank paragraph, as the editor shows it", () => {
    expect(prepareDescriptionHtmlForDisplay("<p>A<br /></p><p>B</p>")).toBe("<p>A</p><p></p><p>B</p>");
  });

  it("keeps a line break in the middle of a paragraph", () => {
    expect(prepareDescriptionHtmlForDisplay("<p>A<br />B</p>")).toBe("<p>A<br />B</p>");
  });

  it("adds one blank paragraph per trailing line break", () => {
    expect(prepareDescriptionHtmlForDisplay("<p>A<br /><br /></p>")).toBe("<p>A</p><p></p><p></p>");
  });

  it("accepts the non-self-closing <br> the editor emits", () => {
    expect(prepareDescriptionHtmlForDisplay("<p>A<br></p>")).toBe("<p>A</p><p></p>");
  });

  it("still strips unsafe markup before normalising", () => {
    expect(prepareDescriptionHtmlForDisplay("<p>A<script>x()</script><br /></p>")).toBe("<p>A</p><p></p>");
  });

  it("leaves legacy plain text with newlines untouched", () => {
    expect(prepareDescriptionHtmlForDisplay("linha 1\nlinha 2")).toBe("linha 1\nlinha 2");
  });
});
