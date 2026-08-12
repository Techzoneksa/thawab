/**
 * Canonical catalog of permission modules and actions for the RBAC editor.
 * Permission strings are `module.action` (e.g. "finance.view") or the module
 * wildcard `module.*`. The global wildcard `*` grants everything.
 *
 * The server checks permissions with wildcard support (see hasPermission), so
 * granting a `module.action` that no handler happens to check is harmless.
 */

export interface PermModule {
  key: string;
  label: string;
}

export const PERM_ACTIONS: { key: string; label: string }[] = [
  { key: "view", label: "عرض" },
  { key: "create", label: "إضافة" },
  { key: "update", label: "تعديل" },
  { key: "delete", label: "حذف" },
];

export const PERM_MODULES: PermModule[] = [
  { key: "finance", label: "المالية" },
  { key: "donations", label: "التبرعات" },
  { key: "donors", label: "المتبرعون" },
  { key: "receipts", label: "سندات القبض" },
  { key: "campaigns", label: "الحملات" },
  { key: "grants", label: "المنح" },
  { key: "endowments", label: "الأوقاف" },
  { key: "projects", label: "المشاريع" },
  { key: "beneficiaries", label: "المستفيدون" },
  { key: "aid", label: "المساعدات" },
  { key: "procurement", label: "المشتريات" },
  { key: "inventory", label: "المخزون" },
  { key: "assets", label: "الأصول" },
  { key: "hr", label: "الموارد البشرية" },
  { key: "memberships", label: "العضويات" },
  { key: "meetings", label: "الاجتماعات" },
  { key: "approvals", label: "الاعتمادات" },
  { key: "reports", label: "التقارير" },
  { key: "audit", label: "سجل التدقيق" },
  { key: "documents", label: "المستندات" },
  { key: "users", label: "المستخدمون والأدوار" },
  { key: "settings", label: "الإعدادات" },
];

const MODULE_KEYS = new Set(PERM_MODULES.map((m) => m.key));
const ACTION_KEYS = new Set(PERM_ACTIONS.map((a) => a.key));

/** True if a permission string is representable in the module×action grid. */
export function isCatalogPerm(p: string): boolean {
  if (p === "*") return false; // handled by the super-admin toggle
  const [mod, action] = p.split(".");
  if (!MODULE_KEYS.has(mod)) return false;
  return action === "*" || ACTION_KEYS.has(action);
}

/** Permission strings the grid does NOT model, so they can be preserved as-is. */
export function extraPerms(perms: string[]): string[] {
  return perms.filter((p) => p !== "*" && !isCatalogPerm(p));
}
