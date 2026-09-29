/* Unit tests for business-date normalization. Run: node_modules/.bin/tsx scripts/test-business-date.mts */
import { normalizeBusinessDate as n } from "../src/lib/business-date.ts";
const cases: [unknown, string | null][] = [
  ["2024-02-10", "2024-02-10"], ["2024/2/10", "2024-02-10"], ["2024-02-10T08:15:00Z", "2024-02-10"],
  ["10/02/2024", "2024-02-10"], ["03/04/2024", "2024-04-03"], ["1/2/2024", "2024-02-01"],
  ["10-02-2024", "2024-02-10"], ["10.02.2024", "2024-02-10"], ["١٠/٠٢/٢٠٢٤", "2024-02-10"],
  ["45332", "2024-02-10"], [new Date("2024-02-10T00:00:00Z"), "2024-02-10"],
  ["31/02/2024", null], ["29/02/2023", null], ["29/02/2024", "2024-02-29"], ["13/13/2024", null],
  ["2024-13-01", null], ["garbage", null], ["", null], [null, null], ["10/02/24", null],
];
let fail = 0;
for (const [input, want] of cases) {
  const got = n(input);
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "✓" : "✗"} ${JSON.stringify(input instanceof Date ? "Date" : input)} → ${got} ${ok ? "" : `(want ${want})`}`);
}
console.log(`\n${cases.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
