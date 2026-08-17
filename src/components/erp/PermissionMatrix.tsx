import { PERM_MODULES, PERM_ACTIONS } from "@/lib/permissions-catalog";
import { FINANCE_PERM_GROUPS } from "@/lib/finance-permissions";

/**
 * Controlled module×action permission grid. Operates on the full permission
 * string array so any non-catalog entries (e.g. "*.view") are preserved
 * untouched. The global "*" super-admin toggle disables the grid.
 */
export function PermissionMatrix({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const set = new Set(value);
  const superAdmin = set.has("*");
  const moduleFull = (m: string) => set.has(`${m}.*`);
  const actionOn = (m: string, a: string) => superAdmin || moduleFull(m) || set.has(`${m}.${a}`);

  const mutate = (fn: (s: Set<string>) => void) => {
    const s = new Set(value);
    fn(s);
    onChange([...s]);
  };

  const toggleSuper = () =>
    mutate((s) => {
      if (s.has("*")) s.delete("*");
      else s.add("*");
    });

  const toggleFull = (m: string) =>
    mutate((s) => {
      const full = `${m}.*`;
      if (s.has(full)) s.delete(full);
      else {
        s.add(full);
        PERM_ACTIONS.forEach((a) => s.delete(`${m}.${a.key}`));
      }
    });

  const toggleAction = (m: string, a: string) =>
    mutate((s) => {
      const full = `${m}.*`;
      if (s.has(full)) {
        // Expand the wildcard into explicit actions, minus the one toggled off.
        s.delete(full);
        PERM_ACTIONS.forEach((x) => s.add(`${m}.${x.key}`));
        s.delete(`${m}.${a}`);
      } else {
        const k = `${m}.${a}`;
        if (s.has(k)) s.delete(k);
        else s.add(k);
      }
    });

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 rounded-xl border bg-card p-3 cursor-pointer">
        <input type="checkbox" className="h-4 w-4" checked={superAdmin} onChange={toggleSuper} />
        <div>
          <div className="text-sm font-bold">صلاحية كاملة على النظام (*)</div>
          <div className="text-xs text-muted-foreground">
            وصول كامل لجميع الوحدات — يتجاوز الجدول أدناه. استخدمه لمدير النظام فقط.
          </div>
        </div>
      </label>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/60 text-right">
              <tr>
                <th className="px-3 py-2 font-semibold text-muted-foreground">الوحدة</th>
                <th className="px-3 py-2 font-semibold text-muted-foreground text-center w-16">
                  الكل
                </th>
                {PERM_ACTIONS.map((a) => (
                  <th
                    key={a.key}
                    className="px-3 py-2 font-semibold text-muted-foreground text-center w-16"
                  >
                    {a.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={superAdmin ? "opacity-40 pointer-events-none" : ""}>
              {PERM_MODULES.map((m) => (
                <tr key={m.key} className="border-t">
                  <td className="px-3 py-2 font-medium">{m.label}</td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={moduleFull(m.key)}
                      onChange={() => toggleFull(m.key)}
                    />
                  </td>
                  {PERM_ACTIONS.map((a) => (
                    <td key={a.key} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={actionOn(m.key, a.key)}
                        disabled={moduleFull(m.key)}
                        onChange={() => toggleAction(m.key, a.key)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Phase 1B — granular finance governance permissions (segregation of
          duties). These do not fit the 4-action grid, so they are assigned
          individually. A wildcard (finance.* or *) covers them all. */}
      <div className="rounded-xl border bg-card p-3">
        <div className="text-sm font-bold mb-1">صلاحيات الحوكمة المالية التفصيلية</div>
        <div className="text-xs text-muted-foreground mb-3">
          فصل المهام: الإنشاء ≠ الاعتماد ≠ الترحيل ≠ العكس ≠ إغلاق/فتح الفترات. تُسنَد كلٌّ على حدة.
        </div>
        <div
          className={
            superAdmin || moduleFull("finance")
              ? "opacity-40 pointer-events-none space-y-3"
              : "space-y-3"
          }
        >
          {FINANCE_PERM_GROUPS.map((g) => (
            <div key={g.key} className="rounded-lg border bg-muted/20 p-2">
              <div className="text-xs font-semibold mb-1.5">{g.label}</div>
              <div className="grid sm:grid-cols-2 gap-1.5">
                {g.perms.map((p) => (
                  <label key={p.key} className="flex items-start gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      className="h-4 w-4 mt-0.5"
                      checked={superAdmin || moduleFull("finance") || set.has(p.key)}
                      disabled={superAdmin || moduleFull("finance")}
                      onChange={() =>
                        mutate((s) => {
                          if (s.has(p.key)) s.delete(p.key);
                          else s.add(p.key);
                        })
                      }
                    />
                    <span>
                      <span className="font-medium">{p.label}</span>
                      {p.desc ? <span className="text-muted-foreground"> — {p.desc}</span> : null}
                      <span className="block text-[10px] text-muted-foreground/70 font-mono ltr:text-left rtl:text-right">
                        {p.key}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
