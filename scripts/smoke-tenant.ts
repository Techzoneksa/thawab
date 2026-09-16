/*
 * Multi-tenant smoke test: routing + isolation + bootstrap, against two REAL,
 * already-migrated Postgres databases. Point it at two empty tenant DBs:
 *   TENANT_A_URL=postgres://… TENANT_B_URL=postgres://… \
 *     node_modules/.bin/tsx scripts/smoke-tenant.ts
 */
const A = process.env.TENANT_A_URL || "postgres://postgres@127.0.0.1:5433/thawab_a";
const B = process.env.TENANT_B_URL || "postgres://postgres@127.0.0.1:5433/thawab_b";
process.env.TENANTS_JSON = JSON.stringify({
  radifa: { databaseUrl: A },
  abufadi: { databaseUrl: B },
});
process.env.BASE_DOMAIN = "jaadpro.com";
process.env.DATABASE_URL = A; // harmless default; tests always bind a tenant

const { resolveTenantByHost } = await import("../src/server/db/tenant-registry.ts");
const { runWithTenant } = await import("../src/server/db/tenant-context.ts");
const { needsBootstrap, bootstrapFirstAdmin } = await import("../src/server/db/auth.ts");
const { db } = await import("../src/server/db/index.ts");
const { users } = await import("../src/server/db/schema.ts");

function withHost<T>(host: string, fn: () => Promise<T>): Promise<T> {
  return runWithTenant(resolveTenantByHost(host), fn);
}
let pass = 0,
  fail = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  cond ? pass++ : fail++;
}

// 1) Both fresh tenants need setup
check("A needs setup (fresh)", (await withHost("radifa.jaadpro.com", needsBootstrap)) === true);
check("B needs setup (fresh)", (await withHost("abufadi.jaadpro.com", needsBootstrap)) === true);

// 2) Bootstrap ONLY tenant A
const r = await withHost("radifa.jaadpro.com", () =>
  bootstrapFirstAdmin({ name: "مدير راضفة", email: "admin@radifa.sa", password: "secret123" }),
);
check("A bootstrap succeeded", !("error" in r));

// 3) Isolation: A is set up, B is still untouched
check("A no longer needs setup", (await withHost("radifa.jaadpro.com", needsBootstrap)) === false);
check("B STILL needs setup (isolated)", (await withHost("abufadi.jaadpro.com", needsBootstrap)) === true);

// 4) Row counts are per-tenant
const aUsers = await withHost("radifa.jaadpro.com", () => db.select().from(users));
const bUsers = await withHost("abufadi.jaadpro.com", () => db.select().from(users));
check("A has exactly 1 user", aUsers.length === 1);
check("B has 0 users (no leak from A)", bUsers.length === 0);
check("A admin has role-admin", aUsers[0]?.role === "role-admin");

// 5) Second bootstrap on A is refused
const again = await withHost("radifa.jaadpro.com", () =>
  bootstrapFirstAdmin({ name: "x", email: "x@x.sa", password: "secret123" }),
);
check("A second bootstrap refused (ALREADY_SETUP)", "error" in again);

// 6) Unknown host → no tenant (would use default)
check("unknown host resolves to null", resolveTenantByHost("nope.example.com") === null);
check("apex resolves to null", resolveTenantByHost("jaadpro.com") === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
