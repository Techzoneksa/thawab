const BASE = "/api/internal/finance/preflight";

export async function getPreflight(): Promise<any> {
  const res = await fetch(BASE);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.message || e.error || "تعذّر تشغيل الفحص");
  }
  return res.json();
}

export async function applyFinanceMigrations(): Promise<any> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "apply-migrations" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || "تعذّر تطبيق الترحيلات");
  return data;
}
