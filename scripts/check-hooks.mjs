// Guard against the exact class of bug that caused React error #310 in
// production: a React Hook called conditionally, in a loop/callback, or after
// an early return — which changes the hook order between renders and crashes
// the page.
//
// The repo's eslint config disables react-hooks/rules-of-hooks for
// src/routes/**/*.tsx because TanStack's inline `component: () => {…}` arrows
// trip the *naming* half of the rule with false positives. This guard runs the
// rule everywhere but reports ONLY the *ordering* messages (the genuinely
// dangerous ones), so it stays signal-only across the whole codebase.
//
// Usage: node scripts/check-hooks.mjs   (exit 1 if any ordering violation)

import { ESLint } from "eslint";
import reactHooks from "eslint-plugin-react-hooks";

// Substrings that identify the ORDERING violations (not the naming ones).
const DANGER = [
  "early return",
  "called conditionally",
  "called in a loop",
  "called in a callback",
  "exact same order",
];

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/rules-of-hooks": "error" },
  },
  errorOnUnmatchedPattern: false,
});

const results = await eslint.lintFiles(["src/**/*.{ts,tsx}"]);

const hits = [];
for (const r of results) {
  for (const m of r.messages) {
    if (m.ruleId !== "react-hooks/rules-of-hooks") continue;
    const msg = m.message || "";
    if (DANGER.some((d) => msg.includes(d))) {
      hits.push(`${r.filePath}:${m.line}:${m.column}  ${msg}`);
    }
  }
}

if (hits.length) {
  console.error("✗ Rules-of-Hooks ORDERING violations (React #310 risk):\n");
  console.error(hits.join("\n"));
  console.error(
    `\n${hits.length} violation(s). Move all hooks above any early return / out of conditionals.`,
  );
  process.exit(1);
}

console.log("✓ hooks OK — no conditional / after-early-return hook calls detected");
