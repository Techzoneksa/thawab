import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge, Table, Td, statusTone, FilterBar, Select } from "@/components/erp/AppShell";
import { PURCHASE_REQUESTS, fmtSAR } from "@/data/sample";
import { Plus, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/procurement/requests")({
  head: () => ({ meta: [{ title: "طلبات الشراء — ثواب" }] }),
  component: () => (
    <AppShell breadcrumb={["الرئيسية", "المشتريات", "طلبات الشراء"]} title="طلبات الشراء"
      actions={<Btn variant="primary"><Plus size={15} />طلب شراء جديد</Btn>}
    >
      <FilterBar>
        <Select label="الحالة" options={["الكل", "بانتظار الموافقة", "معتمد", "مرفوض", "تم التحويل لأمر شراء"]} />
        <Select label="الإدارة" options={["الكل", "إدارة المساعدات", "تقنية المعلومات", "إدارة المشاريع"]} />
        <Select label="المشروع" options={["الكل", "PRJ-016", "PRJ-017", "PRJ-018"]} />
      </FilterBar>
      <Table
        columns={["الرقم", "الموضوع", "مقدم الطلب", "المشروع", "المبلغ", "التاريخ", "الحالة"]}
        rows={PURCHASE_REQUESTS}
        renderRow={(r) => (
          <>
            <Td className="font-mono text-xs">{r.id}</Td>
            <Td className="font-semibold"><ClipboardList size={13} className="inline ms-1 text-primary" />{r.subject}</Td>
            <Td className="text-muted-foreground">{r.requester}</Td>
            <Td className="font-mono text-xs">{r.project}</Td>
            <Td className="tabular-nums font-bold">{fmtSAR(r.amount)}</Td>
            <Td className="text-muted-foreground">{r.date}</Td>
            <Td><Badge tone={statusTone(r.status)}>{r.status}</Badge></Td>
          </>
        )}
      />
    </AppShell>
  ),
});
