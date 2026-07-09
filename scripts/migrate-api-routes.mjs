import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const oldDir = join(root, "src", "routes");
const newDir = join(root, "src", "routes");

const mapping = [
  { from: "-api.donors.ts", to: "api/donors.ts", route: "/api/donors" },
  { from: "-api.donations.ts", to: "api/donations.ts", route: "/api/donations" },
  { from: "-api.receipts.ts", to: "api/receipts.ts", route: "/api/receipts" },
  { from: "-api.projects.ts", to: "api/projects.ts", route: "/api/projects" },
  { from: "-api.beneficiaries.ts", to: "api/beneficiaries.ts", route: "/api/beneficiaries" },
  { from: "-api.aid.ts", to: "api/aid.ts", route: "/api/aid" },
  { from: "-api.audit.ts", to: "api/audit.ts", route: "/api/audit" },
  { from: "-api.auth.ts", to: "api/auth.ts", route: "/api/auth" },
  { from: "-api.finance.accounts.ts", to: "api/finance/accounts.ts", route: "/api/finance/accounts" },
  { from: "-api.finance.journal.ts", to: "api/finance/journal.ts", route: "/api/finance/journal" },
  { from: "-api.finance.ledger.ts", to: "api/finance/ledger.ts", route: "/api/finance/ledger" },
  { from: "-api.finance.budgets.ts", to: "api/finance/budgets.ts", route: "/api/finance/budgets" },
  { from: "-api.finance.cost-centers.ts", to: "api/finance/cost-centers.ts", route: "/api/finance/cost-centers" },
  { from: "-api.finance.statements.ts", to: "api/finance/statements.ts", route: "/api/finance/statements" },
  { from: "-api.finance.periods.ts", to: "api/finance/periods.ts", route: "/api/finance/periods" },
  { from: "-api.procurement.requests.ts", to: "api/procurement/requests.ts", route: "/api/procurement/requests" },
  { from: "-api.procurement.orders.ts", to: "api/procurement/orders.ts", route: "/api/procurement/orders" },
  { from: "-api.procurement.quotes.ts", to: "api/procurement/quotes.ts", route: "/api/procurement/quotes" },
  { from: "-api.procurement.suppliers.ts", to: "api/procurement/suppliers.ts", route: "/api/procurement/suppliers" },
  { from: "-api.inventory.items.ts", to: "api/inventory/items.ts", route: "/api/inventory/items" },
  { from: "-api.inventory.warehouses.ts", to: "api/inventory/warehouses.ts", route: "/api/inventory/warehouses" },
  { from: "-api.inventory.stocktake.ts", to: "api/inventory/stocktake.ts", route: "/api/inventory/stocktake" },
  { from: "-api.assets.ts", to: "api/assets.ts", route: "/api/assets" },
];

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);

function findHandlerRanges(sourceFile) {
  const ranges = [];
  for (const stmt of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(stmt) &&
      stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
      stmt.name &&
      HTTP_METHODS.has(stmt.name.text)
    ) {
      ranges.push({
        name: stmt.name.text,
        start: stmt.getStart(sourceFile),
        end: stmt.getEnd(),
      });
    }
  }
  return ranges;
}

function findImportRangesToStrip(sourceFile) {
  const ranges = [];
  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt)) {
      const spec = stmt.moduleSpecifier.getText(sourceFile);
      if (spec === '"@tanstack/start/server"' || spec === "'@tanstack/start/server'") {
        ranges.push({ start: stmt.getStart(sourceFile), end: stmt.getEnd() });
      }
    }
  }
  return ranges;
}

function transformSource(src, routePath) {
  const sourceFile = ts.createSourceFile(
    "input.ts",
    src,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );

  const handlerRanges = findHandlerRanges(sourceFile);
  const handlerNames = handlerRanges.map((r) => r.name);
  const importRanges = findImportRangesToStrip(sourceFile);

  const allEdits = [];

  for (const r of handlerRanges) {
    let fnText = src.slice(r.start, r.end);
    fnText = fnText.replace(
      /^export\s+async\s+function\s+([A-Z]+)/,
      `async function __handler_$1`,
    );
    fnText = fnText.replace(/: APIEvent\b/g, ": { request: Request }");
    allEdits.push({ start: r.start, end: r.end, replacement: fnText });
  }

  for (const r of importRanges) {
    allEdits.push({ start: r.start, end: r.end, replacement: "" });
  }

  allEdits.sort((a, b) => b.start - a.start);

  let out = "";
  let cursor = src.length;
  for (const edit of allEdits) {
    if (edit.end > cursor) {
      throw new Error(`edit ordering invalid: edit end=${edit.end} cursor=${cursor}`);
    }
    out = src.slice(edit.end, cursor) + out;
    out = edit.replacement + out;
    cursor = edit.start;
  }
  out = src.slice(0, cursor) + out;

  out = out.replace(/\n{3,}/g, "\n\n");

  const handlersObj =
    handlerNames.length === 0
      ? "{}"
      : "{\n" + handlerNames.map((n) => `    ${n}: __handler_${n},`).join("\n") + "\n  }";

  const routeBlock = `\nexport const Route = createFileRoute("${routePath}")({\n  server: {\n    handlers: ${handlersObj},\n  },\n});\n`;

  if (!out.startsWith('import { createFileRoute } from "@tanstack/react-router";\n')) {
    out = `import { createFileRoute } from "@tanstack/react-router";\n` + out;
  }

  out = out + routeBlock;

  return out;
}

async function migrateFile(fromFile, toFile, routePath) {
  const src = await readFile(fromFile, "utf8");
  const result = transformSource(src, routePath);
  await mkdir(dirname(toFile), { recursive: true });
  await writeFile(toFile, result, "utf8");
  const name = fromFile.split(/[\\/]/).pop();
  const short = toFile.split(/[\\/]/).slice(-3).join("/");
  console.log(`  ✓ ${name} → ${short}`);
}

async function main() {
  console.log(`[migrate] starting API route migration`);
  let count = 0;
  for (const entry of mapping) {
    const fromFile = join(oldDir, entry.from);
    const toFile = join(newDir, entry.to);
    if (!existsSync(fromFile)) {
      console.warn(`  ! missing source: ${entry.from}`);
      continue;
    }
    try {
      await migrateFile(fromFile, toFile, entry.route);
      count++;
    } catch (err) {
      console.error(`  ✗ ${entry.from}: ${err.message}`);
      throw err;
    }
  }
  console.log(`[migrate] migrated ${count} files`);
}

main().catch((err) => {
  console.error("[migrate] FAILED:", err);
  process.exit(1);
});
