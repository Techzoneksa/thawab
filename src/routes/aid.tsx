import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge, Table, Td, statusTone } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { HandHelping, Plus } from "lucide-react";

export const Route = createFileRoute("/aid")({
  head: () => ({ meta: [{ title: "المساعدات — ثواب" }] }),
  component: () => {
    const rows = [
      { id: "AID-5012", b: "أحمد محمد العمري", type: "مساعدة شهرية", amount: 1500, project: "كفالة الأيتام", date: "1446/10/12", status: "مصروف" },
      { id: "AID-5011", b: "فاطمة عبدالله السلمي", type: "سلة غذائية", amount: 350, project: "السلال الغذائية", date: "1446/10/12", status: "مصروف" },
      { id: "AID-5010", b: "أسرة سعيد الغامدي", type: "مساعدة عاجلة", amount: 8500, project: "—", date: "1446/10/11", status: "بانتظار الموافقة" },
      { id: "AID-5009", b: "محمد العتيبي", type: "علاج", amount: 12000, project: "علاج المرضى", date: "1446/10/10", status: "مصروف" },
      { id: "AID-5008", b: "أسرة خالد القرني", type: "كسوة شتاء", amount: 800, project: "كسوة الشتاء", date: "1446/10/09", status: "مصروف" },
    ];
    return (
      <AppShell breadcrumb={["الرئيسية", "المشاريع والمستفيدون", "المساعدات"]} title="سجل المساعدات المصروفة"
        actions={<Btn variant="primary"><HandHelping size={15} />صرف مساعدة جديدة</Btn>}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {[{ l: "مساعدات هذا الشهر", v: "1,842" }, { l: "قيمة المصروف", v: fmtSAR(820_000) }, { l: "بانتظار الصرف", v: "84" }, { l: "متوسط المساعدة", v: fmtSAR(445) }].map((s) => (
            <Card key={s.l} className="p-4"><div className="text-xs text-muted-foreground">{s.l}</div><div className="text-lg font-extrabold mt-1">{s.v}</div></Card>
          ))}
        </div>
        <Table
          columns={["الرقم", "المستفيد", "النوع", "المبلغ", "المشروع", "التاريخ", "الحالة"]}
          rows={rows}
          renderRow={(r) => (
            <>
              <Td className="font-mono text-xs">{r.id}</Td>
              <Td className="font-semibold">{r.b}</Td>
              <Td>{r.type}</Td>
              <Td className="tabular-nums font-bold">{fmtSAR(r.amount)}</Td>
              <Td>{r.project}</Td>
              <Td className="text-muted-foreground">{r.date}</Td>
              <Td><Badge tone={statusTone(r.status)}>{r.status}</Badge></Td>
            </>
          )}
        />
      </AppShell>
    );
  },
});
