/** The report's file name, for the download and the email attachment alike. */
export function reportFilename(companyName: string): string {
  // Characters that file systems reject, and control characters, become spaces.
  const name = companyName
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${name || 'Company'} - AI Opportunity Assessment.pdf`;
}

/** The file name in printable ASCII ("Škoda" → "Skoda"), for headers that take nothing else. */
export function asciiFilename(filename: string): string {
  return filename
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]|["\\]/g, '_');
}

/** RFC 5987 percent-encoding, as used in `filename*=UTF-8''…`. */
export function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Content-Disposition for downloading a file of this name (RFC 6266). Header values must be
 * Latin-1, so a raw "Škoda" or "Łódź" in them makes the response throw; the full name goes in
 * `filename*` instead, with an ASCII fallback for old clients.
 */
export function attachmentDisposition(filename: string): string {
  return `attachment; filename="${asciiFilename(filename)}"; filename*=UTF-8''${encodeRfc5987(filename)}`;
}
