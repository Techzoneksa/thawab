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

/** Issue the immutable Phase 1A certificate for the current deployed commit. */
export async function certifyPhase1A(): Promise<any> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "certify" }),
  });
  const data = await res.json().catch(() => ({}));
  // 409 = not eligible yet (blocked / pending); surface reasons without throwing
  // a generic error so the UI can show the precise state.
  if (!res.ok && res.status !== 409)
    throw new Error(data.message || data.error || "تعذّر إصدار الشهادة");
  return { ok: res.ok, httpStatus: res.status, ...data };
}
