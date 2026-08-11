/**
 * Printing: mounts the document layout (if needed) and invokes the browser's
 * print dialog. The print CSS in DocumentLayout isolates `.thawab-doc`, so the
 * user gets a clean A4 document (and a real, correctly-shaped Arabic PDF via
 * the browser's "Save as PDF").
 */
export function printDocument() {
  if (typeof window === "undefined") return;
  // Allow the hidden layout to paint before printing.
  window.requestAnimationFrame(() => window.print());
}
