/**
 * CI guard against mojibake (encoding corruption). Exits 1 if any source file
 * shows the tell-tale UTF-8-as-CP1256 signature (saturated with ط/ظ).
 *
 * Usage: node scripts/check-encoding.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".") || name === "drizzle") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if ([".ts", ".tsx"].includes(extname(name))) out.push(p);
  }
  return out;
}

let bad = 0;
for (const f of walk("src")) {
  const s = readFileSync(f, "utf8");
  let arabic = 0;
  let taZa = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 0x0600 && c <= 0x06ff) {
      arabic++;
      if (c === 0x0637 || c === 0x0638) taZa++;
    }
  }
  if (arabic >= 5 && taZa / arabic > 0.35) {
    console.error(`✗ mojibake suspected: ${f} (ط/ظ ratio ${(taZa / arabic).toFixed(2)})`);
    bad++;
  }
}

if (bad) {
  console.error(`\n${bad} file(s) look mojibake-corrupted. Re-save as UTF-8.`);
  process.exit(1);
}
console.log("✓ encoding OK — no mojibake detected");
