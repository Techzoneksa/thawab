/**
 * Phase 2A — Saudi IBAN normalization, validation, and masking.
 * Pure functions (no network, no external bank API). Shared client/server.
 *
 * Saudi IBAN: "SA" + 2 check digits + 2-digit bank code + 18-digit BBAN = 24
 * chars total. Validation applies the ISO 13616 / ISO 7064 MOD-97-10 checksum.
 */

/** Strip all whitespace and uppercase. Returns "" for empty input. */
export function normalizeIban(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, "").toUpperCase();
}

/** ISO 7064 MOD-97-10 over the rearranged IBAN — valid when the remainder is 1. */
function mod97(iban: string): number {
  // Move the first 4 chars to the end, map letters A..Z → 10..35.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const value = code >= 65 && code <= 90 ? code - 55 : code - 48; // A-Z→10.., 0-9→0..
    if (value < 0 || value > 35) return -1;
    remainder = (remainder * (value > 9 ? 100 : 10) + value) % 97;
  }
  return remainder;
}

/** True for a structurally valid Saudi IBAN (SA + 22 digits, checksum OK). */
export function isValidSaudiIban(raw: string | null | undefined): boolean {
  const iban = normalizeIban(raw);
  if (!/^SA\d{22}$/.test(iban)) return false; // exactly 24 chars, SA + 22 digits
  return mod97(iban) === 1;
}

/**
 * Mask for list/log display: keep the first 4 and last 4, group the middle as
 * "****". e.g. "SA0380000000608010167519" → "SA03 **** **** **** 7519".
 * Returns "" for empty input; if too short to mask, returns the normalized form.
 */
export function maskIban(raw: string | null | undefined): string {
  const iban = normalizeIban(raw);
  if (!iban) return "";
  if (iban.length <= 8) return iban;
  const head = iban.slice(0, 4);
  const tail = iban.slice(-4);
  return `${head} **** **** **** ${tail}`;
}
