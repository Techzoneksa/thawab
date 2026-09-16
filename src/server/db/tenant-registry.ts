/**
 * Tenant registry — resolves an incoming request Host to a tenant + its
 * database connection string.
 *
 * SOURCE (v1): the `TENANTS_JSON` environment variable, a JSON object keyed by
 * subdomain label, each value carrying that tenant's `databaseUrl` (a Neon
 * connection string). Secrets live in the environment, never in code or git.
 *   TENANTS_JSON = {"radifa":{"databaseUrl":"postgres://…neon…"},"abufadi":{…}}
 *   BASE_DOMAIN  = jaadpro.com
 *
 * INERTNESS: when `TENANTS_JSON` is not set (the existing single-tenant
 * deployment, e.g. thawab.jaadpro.com on Supabase), `resolveTenantByHost`
 * returns null and the caller falls back to the default DATABASE_URL. Resolution
 * NEVER throws — a bad host or malformed registry degrades to "no tenant".
 *
 * A later phase replaces the env source with a control-plane database so new
 * tenants are added by inserting a row (no redeploy) — the resolver interface
 * stays the same.
 */
import type { TenantContext } from "./tenant-context";

interface TenantEntry {
  databaseUrl: string;
}

let _cache: Map<string, TenantEntry> | null = null;
let _loggedBadJson = false;

/** Parse and cache TENANTS_JSON. Returns null when unconfigured. */
function loadRegistry(): Map<string, TenantEntry> | null {
  if (_cache) return _cache;
  const raw = process.env.TENANTS_JSON;
  if (!raw || !raw.trim()) return null;
  try {
    const obj = JSON.parse(raw) as Record<string, { databaseUrl?: unknown }>;
    const map = new Map<string, TenantEntry>();
    for (const [key, val] of Object.entries(obj)) {
      const url = val?.databaseUrl;
      if (typeof url === "string" && url.trim()) {
        map.set(key.trim().toLowerCase(), { databaseUrl: url.trim() });
      }
    }
    _cache = map;
    return map;
  } catch (e) {
    if (!_loggedBadJson) {
      console.error("[tenant] TENANTS_JSON is not valid JSON — ignoring:", (e as Error).message);
      _loggedBadJson = true;
    }
    return null;
  }
}

/**
 * Extract the subdomain label from a Host header.
 *   "radifa.jaadpro.com"        → "radifa"   (with BASE_DOMAIN=jaadpro.com)
 *   "radifa.jaadpro.com:3000"   → "radifa"
 *   "jaadpro.com" (apex)        → null
 * Falls back to the first label of any 3+ part host when BASE_DOMAIN is unset.
 */
export function subdomainOf(host: string): string | null {
  const h = (host || "").split(":")[0].trim().toLowerCase();
  if (!h) return null;
  const base = (process.env.BASE_DOMAIN || "").trim().toLowerCase();
  if (base) {
    if (h === base) return null; // apex is not a tenant
    if (h.endsWith("." + base)) {
      const label = h.slice(0, h.length - base.length - 1);
      // Only a single leftmost label is a tenant (ignore deep sub-subdomains).
      return label && !label.includes(".") ? label : (label.split(".").pop() ?? null);
    }
    return null;
  }
  const parts = h.split(".");
  return parts.length >= 3 ? parts[0] : null;
}

/** Resolve a request Host to a bound tenant, or null (→ default database). */
export function resolveTenantByHost(host: string): TenantContext | null {
  try {
    const registry = loadRegistry();
    if (!registry) return null;
    const sub = subdomainOf(host);
    if (!sub) return null;
    const entry = registry.get(sub);
    if (!entry) return null;
    return { id: sub, host, databaseUrl: entry.databaseUrl };
  } catch {
    return null;
  }
}

/** True when a multi-tenant registry is configured (for diagnostics/guards). */
export function isMultiTenant(): boolean {
  return loadRegistry() !== null;
}

/** Test/ops hook: drop the cached registry so a changed env is re-read. */
export function resetTenantRegistryCache(): void {
  _cache = null;
  _loggedBadJson = false;
}
