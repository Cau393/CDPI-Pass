import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { dataUrlToBlob, downloadDataUrl } from "../../lib/downloadDataUrl";

const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

describe("dataUrlToBlob", () => {
  it("keeps the mime type of the data url", () => {
    expect(dataUrlToBlob(PNG_DATA_URL).type).toBe("image/png");
  });

  it("decodes the base64 payload byte for byte", () => {
    expect(dataUrlToBlob(PNG_DATA_URL).size).toBe(8);
  });
});

describe("downloadDataUrl", () => {
  const clicks: { href: string; download: string; connected: boolean }[] = [];

  beforeEach(() => {
    clicks.length = 0;
    // jsdom has no object URLs; the helper must go through them for iOS.
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push({ href: this.href, download: this.download, connected: this.isConnected });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clicks an anchor that points at the blob url, not the data url", () => {
    downloadDataUrl(PNG_DATA_URL, "ingresso-o1.png");

    expect(clicks[0].href).toBe("blob:mock");
  });

  it("names the saved file with the given filename", () => {
    downloadDataUrl(PNG_DATA_URL, "ingresso-o1.png");

    expect(clicks[0].download).toBe("ingresso-o1.png");
  });

  it("attaches the anchor to the document before clicking so iOS honours the download", () => {
    downloadDataUrl(PNG_DATA_URL, "ingresso-o1.png");

    expect(clicks[0].connected).toBe(true);
  });

  it("removes the temporary anchor after clicking", () => {
    downloadDataUrl(PNG_DATA_URL, "ingresso-o1.png");

    expect(document.querySelector('a[download="ingresso-o1.png"]')).toBeNull();
  });
});
