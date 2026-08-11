/**
 * Deterministic mojibake repair.
 *
 * The route/UI source files were saved after UTF-8 Arabic bytes were misread as
 * Windows-1256 (CP1256). Reversal: encode each character back to its CP1256 byte,
 * then decode the byte stream as UTF-8.
 *
 * Safety:
 *  - Detection by density: mojibake text is saturated with 'ط'(D8)/'ظ'(D9) lead
 *    bytes; genuine Arabic uses them rarely. Only files above the threshold are touched.
 *  - Abort a file if any non-ASCII char is absent from the CP1256 table.
 *  - Abort if the decoded result contains U+FFFD (replacement char).
 *  - Abort if the reversal does not actually reduce ط/ظ density.
 *
 * Usage:
 *   node scripts/fix-mojibake.mjs            # dry run (report only)
 *   node scripts/fix-mojibake.mjs --apply    # write changes
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// CP1256 high range 0x80..0xFF -> Unicode code point.
const CP1256_HIGH = [
  0x20ac, 0x067e, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0679, 0x2039, 0x0152, 0x0686, 0x0698, 0x0688, 0x06af, 0x2018, 0x2019, 0x201c,
  0x201d, 0x2022, 0x2013, 0x2014, 0x06a9, 0x2122, 0x0691, 0x203a, 0x0153, 0x200c,
  0x200d, 0x06ba, 0x00a0, 0x060c, 0x00a2, 0x00a3, 0x00a4, 0x00a5, 0x00a6, 0x00a7,
  0x00a8, 0x00a9, 0x06be, 0x00ab, 0x00ac, 0x00ad, 0x00ae, 0x00af, 0x00b0, 0x00b1,
  0x00b2, 0x00b3, 0x00b4, 0x00b5, 0x00b6, 0x00b7, 0x00b8, 0x00b9, 0x061b, 0x00bb,
  0x00bc, 0x00bd, 0x00be, 0x061f, 0x06c1, 0x0621, 0x0622, 0x0623, 0x0624, 0x0625,
  0x0626, 0x0627, 0x0628, 0x0629, 0x062a, 0x062b, 0x062c, 0x062d, 0x062e, 0x062f,
  0x0630, 0x0631, 0x0632, 0x0633, 0x0634, 0x0635, 0x0636, 0x00d7, 0x0637, 0x0638,
  0x0639, 0x063a, 0x0640, 0x0641, 0x0642, 0x0643, 0x00e0, 0x0644, 0x00e2, 0x0645,
  0x0646, 0x0647, 0x0648, 0x00e7, 0x00e8, 0x00e9, 0x00ea, 0x00eb, 0x0649, 0x064a,
  0x00ee, 0x00ef, 0x064b, 0x064c, 0x064d, 0x064e, 0x00f4, 0x064f, 0x0650, 0x00f7,
  0x0651, 0x00f9, 0x0652, 0x00fb, 0x00fc, 0x200e, 0x200f, 0x06d2,
];

const UNI_TO_BYTE = new Map();
for (let i = 0; i < CP1256_HIGH.length; i++) UNI_TO_BYTE.set(CP1256_HIGH[i], 0x80 + i);

function arabicStats(s) {
  let arabic = 0;
  let taZa = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 0x0600 && c <= 0x06ff) {
      arabic++;
      if (c === 0x0637 || c === 0x0638) taZa++; // ط / ظ
    }
  }
  return { arabic, taZa, ratio: arabic ? taZa / arabic : 0 };
}

function reverse(s) {
  const bytes = [];
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c === 0xfeff) {
      continue; // BOM / zero-width no-break space — genuine, drop it
    } else if (c < 0x80) {
      bytes.push(c);
    } else if (UNI_TO_BYTE.has(c)) {
      bytes.push(UNI_TO_BYTE.get(c));
    } else {
      return null; // char not representable in CP1256 -> not clean mojibake
    }
  }
  const decoded = Buffer.from(bytes).toString("utf8");
  if (decoded.includes("�")) return null;
  return decoded;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".") || name === "drizzle") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if ([".ts", ".tsx", ".md"].includes(extname(name))) out.push(p);
  }
  return out;
}

const APPLY = process.argv.includes("--apply");
const DETECT_RATIO = 0.35; // mojibake >> 0.35; genuine Arabic << 0.1
const files = walk("src");
let changed = 0;
let skippedGenuine = 0;
let aborted = 0;

for (const f of files) {
  const src = readFileSync(f, "utf8");
  const before = arabicStats(src);
  if (before.arabic < 5) continue; // no meaningful Arabic
  if (before.ratio < DETECT_RATIO) {
    skippedGenuine++;
    continue; // genuine Arabic — leave alone
  }
  const fixed = reverse(src);
  if (fixed === null) {
    aborted++;
    console.log(`ABORT (unrepresentable/FFFD): ${f}`);
    continue;
  }
  const after = arabicStats(fixed);
  if (after.ratio >= before.ratio) {
    aborted++;
    console.log(`ABORT (no improvement): ${f} ratio ${before.ratio.toFixed(2)} -> ${after.ratio.toFixed(2)}`);
    continue;
  }
  changed++;
  const sampleBefore = (src.match(/["'][^"']*[؀-ۿ][^"']*["']/) || [""])[0].slice(0, 50);
  const sampleAfter = (fixed.match(/["'][^"']*[؀-ۿ][^"']*["']/) || [""])[0].slice(0, 50);
  console.log(`${APPLY ? "FIX " : "WOULD-FIX "} ${f}`);
  console.log(`    before: ${sampleBefore}`);
  console.log(`    after : ${sampleAfter}`);
  if (APPLY) writeFileSync(f, fixed, "utf8");
}

console.log(`\n${APPLY ? "Applied" : "Dry-run"}: ${changed} file(s) ${APPLY ? "fixed" : "would be fixed"}, ${skippedGenuine} genuine-Arabic skipped, ${aborted} aborted.`);
