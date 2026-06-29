import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Table, Td } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { Printer, Download } from "lucide-react";

export const Route = createFileRoute("/receipts")({
  head: () => ({ meta: [{ title: "الإيصالات الإلكترونية — ثواب" }] }),
  component: () => {
    const rows = Array.from({ length: 10 }).map((_, i) => ({
      id: `RCT-2406-0${188 - i}`,
      donor: ["مؤسسة الراجحي الإنسانية", "عبدالله العتيبي", "شركة أرامكو", "نورة القحطاني", "خالد الدوسري"][i % 5],
      amount: [600_000, 12_000, 250_000, 5_000, 800][i % 5],
      date: `1446/10/${12 - i}`,
      channel: ["البوابة الإلكترونية", "تطبيق الجوال", "مقر الجمعية"][i % 3],
    }));
    return (
      <AppShell breadcrumb={["الرئيسية", "التبرعات", "الإيصالات"]} title="الإيصالات الإلكترونية"
        actions={<><Btn variant="outline"><Printer size={15} />طباعة دفعية</Btn><Btn variant="primary"><Download size={15} />تنزيل الكل</Btn></>}
      >
        <Table
          columns={["رقم الإيصال", "المتبرع", "المبلغ", "التاريخ", "القناة", ""]}
          rows={rows}
          renderRow={(r) => (
            <>
              <Td className="font-mono text-xs">{r.id}</Td>
              <Td className="font-semibold">{r.donor}</Td>
              <Td className="tabular-nums font-bold text-success">{fmtSAR(r.amount)}</Td>
              <Td className="text-muted-foreground">{r.date}</Td>
              <Td>{r.channel}</Td>
              <Td><div className="flex gap-1"><button className="text-primary text-xs font-semibold"><Printer size={13} className="inline" /> طباعة</button> · <button className="text-primary text-xs font-semibold">PDF</button></div></Td>
            </>
          )}
        />
      </AppShell>
    );
  },
});
