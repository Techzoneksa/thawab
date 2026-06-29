import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Btn, Badge, Table, Td, statusTone } from "@/components/erp/AppShell";
import { UserCog, Plus, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/settings/users")({
  head: () => ({ meta: [{ title: "المستخدمون — ثواب" }] }),
  component: () => {
    const users = [
      { id: "USR-001", name: "د. عبدالله السبيعي", email: "ceo@albir.org.sa", role: "المدير التنفيذي", twofa: true, last: "اليوم 11:24", status: "نشط" },
      { id: "USR-002", name: "سعد الغامدي", email: "cfo@albir.org.sa", role: "المدير المالي", twofa: true, last: "اليوم 10:40", status: "نشط" },
      { id: "USR-003", name: "سارة الزهراني", email: "s.zahrani@albir.org.sa", role: "محاسب", twofa: true, last: "اليوم 09:58", status: "نشط" },
      { id: "USR-004", name: "فهد العتيبي", email: "f.otaibi@albir.org.sa", role: "مدير المشاريع", twofa: false, last: "أمس 17:12", status: "نشط" },
      { id: "USR-005", name: "خالد الدوسري", email: "k.dossari@albir.org.sa", role: "أخصائي مشتريات", twofa: true, last: "أمس 14:20", status: "إجازة" },
      { id: "USR-006", name: "منى السلمي", email: "m.salmi@albir.org.sa", role: "باحث اجتماعي", twofa: false, last: "1446/10/10", status: "نشط" },
    ];
    return (
      <AppShell breadcrumb={["الرئيسية", "الإعدادات", "المستخدمون"]} title="إدارة المستخدمين"
        actions={<Btn variant="primary"><Plus size={15} />مستخدم جديد</Btn>}
      >
        <Table
          columns={["الرقم", "المستخدم", "البريد", "الدور", "2FA", "آخر دخول", "الحالة"]}
          rows={users}
          renderRow={(u) => (
            <>
              <Td className="font-mono text-xs">{u.id}</Td>
              <Td className="font-semibold"><UserCog size={13} className="inline ms-1 text-primary" />{u.name}</Td>
              <Td className="font-mono text-xs text-muted-foreground">{u.email}</Td>
              <Td>{u.role}</Td>
              <Td>{u.twofa ? <Badge tone="success"><ShieldCheck size={11} className="inline ms-1" />مفعّل</Badge> : <Badge tone="warning">غير مفعّل</Badge>}</Td>
              <Td className="text-muted-foreground text-xs">{u.last}</Td>
              <Td><Badge tone={statusTone(u.status)}>{u.status}</Badge></Td>
            </>
          )}
        />
      </AppShell>
    );
  },
});
