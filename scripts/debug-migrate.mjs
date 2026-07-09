import ts from "typescript";
import { readFile } from "node:fs/promises";

const src = await readFile("src/routes/-api.auth.ts", "utf8");
const sf = ts.createSourceFile("auth.ts", src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

const handlerRanges = [];
for (const stmt of sf.statements) {
  if (
    ts.isFunctionDeclaration(stmt) &&
    stmt.name?.text &&
    ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"].includes(stmt.name.text)
  ) {
    handlerRanges.push({ start: stmt.getStart(sf), end: stmt.getEnd(), name: stmt.name.text });
  }
}

const apiEventRanges = [];
function walk(node) {
  if (ts.isTypeReferenceNode(node) && node.typeName.getText(sf) === "APIEvent") {
    apiEventRanges.push({ start: node.getStart(sf), end: node.getEnd() });
  }
  ts.forEachChild(node, walk);
}
for (const stmt of sf.statements) walk(stmt);

const importRanges = [];
for (const stmt of sf.statements) {
  if (ts.isImportDeclaration(stmt)) {
    const spec = stmt.moduleSpecifier.getText(sf);
    if (spec === '"@tanstack/start/server"') {
      importRanges.push({ start: stmt.getStart(sf), end: stmt.getEnd() });
    }
  }
}

console.log("handlers:", handlerRanges);
console.log("apiEvent:", apiEventRanges);
console.log("imports:", importRanges);

const edits = [
  ...handlerRanges.map((r) => ({
    kind: "handler",
    start: r.start,
    end: r.end,
    name: r.name,
    replacement: src.slice(r.start, r.start + ("export async function " + r.name).length).replace(/^export\s+async\s+function\s+[A-Z]+/, "async function __handler_" + r.name) + src.slice(r.start + ("export async function " + r.name).length, r.end),
  })),
  ...apiEventRanges.map((r) => ({ kind: "apiEvent", start: r.start, end: r.end, replacement: "" })),
  ...importRanges.map((r) => ({ kind: "import", start: r.start, end: r.end, replacement: "" })),
].sort((a, b) => b.start - a.start);

console.log("edits in order:");
for (const e of edits) {
  console.log(" ", e.kind, e.start + "-" + e.end, "replace=" + JSON.stringify(e.replacement.substring(0, 60)));
}

let out = src;
for (const edit of edits) {
  out = out.slice(0, edit.start) + edit.replacement + out.slice(edit.end);
}
console.log("=== output (100-200) ===");
console.log(JSON.stringify(out.substring(100, 200)));
console.log("=== full ===");
console.log(out);
