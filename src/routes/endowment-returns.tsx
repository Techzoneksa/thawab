import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, SectionTitle, Btn, MobilePageHeader } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { Plus } from "lucide-react";
import { useState } from "react";
import { showToast, EntityFormDrawer } from "@/components/erp/actions";

type ReturnItem = { q: string; v: number };

export const Route = createFileRoute("/endowment-returns")({
  head: () => ({ meta: [{ title: "عوائد الأوقاف — ثواب" }] }),
  component: () => {
    const [data, setData] = useState<ReturnItem[]>([
      { q: "Q1 1446", v: 192000 },
      { q: "Q2 1446", v: 204000 },
      { q: "Q3 1446", v: 218000 },
      { q: "Q4 1446 (متوقع)", v: 184000 },
    ]);
    const [formOpen, setFormOpen] = useState(false);
    const [formQuarter, setFormQuarter] = useState("");
    const [formAmount, setFormAmount] = useState("");

    const max = Math.max(...data.map((d) => d.v));

    const handleSave = () => {
      if (!formQuarter.trim() || !formAmount.trim()) {
        showToast("يرجى إدخال البيانات", "error");
        return;
      }
      setData([...data, { q: formQuarter, v: Number(formAmount) }]);
      showToast("تم إضافة عائد الوقف بنجاح", "success");
      setFormOpen(false);
      setFormQuarter("");
      setFormAmount("");
    };

    return (
      <>
        <AppShell
          breadcrumb={["الرئيسية", "المنح والأوقاف", "عوائد الأوقاف"]}
          title="عوائد الأوقاف الاستثمارية"
          actions={
            <Btn variant="primary" onClick={() => setFormOpen(true)}>
              <Plus size={15} /> إضافة عائد وقف
            </Btn>
          }
        >
          <MobilePageHeader title="عوائد الأوقاف الاستثمارية" count={`${data.length} ربع`} />
          <Card className="p-5">
            <SectionTitle
              title="العوائد الربعية للسنة 1446هـ"
              hint={`إجمالي محقق: ${fmtSAR(data.reduce((a, d) => a + d.v, 0))}`}
            />
            <div className="overflow-x-auto">
              <div className="flex items-end gap-6 h-60 min-w-[400px]">
                {data.map((d) => (
                  <div key={d.q} className="flex-1 flex flex-col items-center gap-2">
                    <div className="text-xs font-bold tabular-nums">{fmtSAR(d.v)}</div>
                    <div
                      className="w-full bg-gradient-to-t from-primary to-info/70 rounded-t"
                      style={{ height: `${(d.v / max) * 90}%` }}
                    />
                    <div className="text-xs text-muted-foreground">{d.q}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </AppShell>

        <EntityFormDrawer
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title="إضافة عائد وقف"
          onSave={handleSave}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الربع</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formQuarter}
              onChange={(e) => setFormQuarter(e.target.value)}
              placeholder="مثال: Q1 1447"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">القيمة</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="number"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
            />
          </div>
        </EntityFormDrawer>
      </>
    );
  },
});
