/**
 * Multi-tenant request context (SaaS).
 *
 * Each incoming HTTP request is bound to at most ONE tenant, resolved from the
 * request Host (subdomain). The binding is carried through the whole async call
 * tree with AsyncLocalStorage, so the shared `db` handle (see client.ts) can
 * transparently resolve the CURRENT tenant's database without threading a
 * parameter through hundreds of call sites.
 *
 * SAFETY — single-tenant deployments are unaffected: when no tenant is bound
 * (no registry configured, e.g. the existing thawab.jaadpro.com on Supabase),
 * `getCurrentTenant()` returns null and the default DATABASE_URL is used.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantContext {
  /** Stable tenant id / slug — the subdomain label (e.g. "radifa"). */
  id: string;
  /** The full request host (e.g. "radifa.jaadpro.com") — for diagnostics. */
  host: string;
  /** The tenant's PostgreSQL connection string. Never logged. */
  databaseUrl: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

/**
 * Run `fn` with `ctx` bound as the current tenant. When `ctx` is null the
 * function runs with NO tenant bound (default/single-tenant behavior).
 */
export function runWithTenant<T>(ctx: TenantContext | null, fn: () => T): T {
  if (!ctx) return fn();
  return storage.run(ctx, fn);
}

/** The tenant bound to the current async context, or null if none. */
export function getCurrentTenant(): TenantContext | null {
  return storage.getStore() ?? null;
}
