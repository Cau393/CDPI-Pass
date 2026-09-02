/**
 * Decode a CSV upload to a JS string.
 *
 * Brazilian Excel still saves CSV as Windows-1252 / ISO-8859-1 unless the
 * user picks "CSV UTF-8". Decoding those bytes as UTF-8 turns ê/ç/ã into U+FFFD
 * (�), which then shows up in courtesy e-mails as "Cau�".
 *
 * Prefer UTF-8 (with or without BOM) when the bytes are valid UTF-8; otherwise
 * fall back to Latin-1, which covers Portuguese names from Excel.
 */
export function decodeCsvBuffer(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString("utf8");
  }
  if (isValidUtf8(buffer)) {
    return buffer.toString("utf8");
  }
  return buffer.toString("latin1");
}

function isValidUtf8(buffer: Buffer): boolean {
  return Buffer.from(buffer.toString("utf8"), "utf8").equals(buffer);
}
