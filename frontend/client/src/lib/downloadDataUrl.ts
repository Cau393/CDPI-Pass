/** Converts `data:<mime>;base64,<payload>` (or a plain-text data URL) into a Blob. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload = ""] = dataUrl.split(",");
  const mime = header.match(/^data:([^;,]+)/)?.[1] ?? "application/octet-stream";
  if (!/;base64$/i.test(header)) {
    return new Blob([decodeURIComponent(payload)], { type: mime });
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Saves a data URL as a file. A detached `<a download href="data:...">` is ignored by
 * iOS Safari and by in-app browsers (WhatsApp/Instagram), so the payload becomes a
 * Blob object URL and the anchor is attached to the document before the click.
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const objectUrl = URL.createObjectURL(dataUrlToBlob(dataUrl));
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking synchronously cancels the save in Safari; give the browser a moment.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
