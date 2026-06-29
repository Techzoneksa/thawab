import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Table, Td, Badge } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/finance/cost-centers")({
  head: () => ({ meta: [{ title: "مراكز التكلفة — ثواب" }] }),
  component: () => {
    const rows = [
      { c: "CC-100", n: "مركز المشاريع التشغيلية", mgr: "فهد العتيبي", b: 8_400_000, s: 5_120_000 },
      { c: "CC-200", n: "مركز المساعدات المباشرة", mgr: "منى السلمي", b: 12_200_000, s: 7_840_000 },
      { c: "CC-300", n: "مركز الإدارة العامة", mgr: "سعد الغامدي", b: 2_400_000, s: 1_640_000 },
      { c: "CC-400", n: "مركز جمع التبرعات", mgr: "نورة الشهري", b: 1_400_000, s: 720_000 },
      { c: "CC-500", n: "مركز الأوقاف", mgr: "عبدالرحمن العمر", b: 980_000, s: 410_000 },
    ];
    return (
      <AppShell breadcrumb={["الرئيسية", "المالية", "مراكز التكلفة"]} title="مراكز التكلفة"
        actions={<Btn variant="primary"><Plus size={15} />مركز جديد</Btn>}
      >
        <Table
          columns={["الرمز", "المركز", "المسؤول", "الموازنة", "المنصرف", "النسبة", "الحالة"]}
          rows={rows}
          renderRow={(r) => {
            const pct = Math.round((r.s / r.b) * 100);
            return (
              <>
                <Td className="font-mono text-xs">{r.c}</Td>
                <Td className="font-semibold">{r.n}</Td>
                <Td className="text-muted-foreground">{r.mgr}</Td>
                <Td className="tabular-nums">{fmtSAR(r.b)}</Td>
                <Td className="tabular-nums">{fmtSAR(r.s)}</Td>
                <Td><div className="flex items-center gap-2 w-32"><div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div><span className="text-xs">{pct}%</span></div></Td>
                <Td><Badge tone="success">نشط</Badge></Td>
              </>
            );
          }}
        />
      </AppShell>
    );
  },
});
