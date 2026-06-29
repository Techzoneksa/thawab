import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge, Table, Td, statusTone } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { Repeat, Plus } from "lucide-react";

export const Route = createFileRoute("/recurring")({
  head: () => ({ meta: [{ title: "التبرعات المتكررة — ثواب" }] }),
  component: () => {
    const rows = [
      { id: "RCR-101", donor: "شركة أرامكو السعودية", amount: 50_000, freq: "شهري", project: "كفالة الأيتام", next: "1446/11/01", status: "نشط" },
      { id: "RCR-102", donor: "عبدالله العتيبي", amount: 800, freq: "شهري", project: "كفالة طفل يتيم", next: "1446/11/05", status: "نشط" },
      { id: "RCR-103", donor: "نورة القحطاني", amount: 1_200, freq: "شهري", project: "السلال الغذائية", next: "1446/11/10", status: "نشط" },
      { id: "RCR-104", donor: "خالد الدوسري", amount: 500, freq: "أسبوعي", project: "صدقة جارية", next: "1446/10/18", status: "نشط" },
      { id: "RCR-105", donor: "هند السبيعي", amount: 2_400, freq: "ربع سنوي", project: "كسوة الشتاء", next: "1447/01/01", status: "نشط" },
      { id: "RCR-106", donor: "فهد المالكي", amount: 300, freq: "شهري", project: "إفطار صائم", next: "—", status: "موقوف" },
    ];
    return (
      <AppShell breadcrumb={["الرئيسية", "التبرعات", "التبرعات المتكررة"]} title="التبرعات المتكررة"
        actions={<Btn variant="primary"><Plus size={15} />تبرع متكرر جديد</Btn>}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {[{ l: "تبرعات متكررة نشطة", v: "2,840" }, { l: "إيراد شهري متوقع", v: fmtSAR(420_000) }, { l: "نسبة الاستمرارية", v: "92%" }, { l: "متبرع جديد هذا الشهر", v: "184" }].map((s) => (
            <Card key={s.l} className="p-4"><div className="text-xs text-muted-foreground">{s.l}</div><div className="text-lg font-extrabold mt-1 tabular-nums">{s.v}</div></Card>
          ))}
        </div>
        <Table
          columns={["الرقم", "المتبرع", "المبلغ", "التكرار", "المشروع", "الخصم القادم", "الحالة"]}
          rows={rows}
          renderRow={(r) => (
            <>
              <Td className="font-mono text-xs">{r.id}</Td>
              <Td className="font-semibold">{r.donor}</Td>
              <Td className="tabular-nums font-bold">{fmtSAR(r.amount)}</Td>
              <Td><Badge tone="info"><Repeat size={11} className="inline ms-1" />{r.freq}</Badge></Td>
              <Td>{r.project}</Td>
              <Td className="text-muted-foreground">{r.next}</Td>
              <Td><Badge tone={statusTone(r.status)}>{r.status}</Badge></Td>
            </>
          )}
        />
      </AppShell>
    );
  },
});
