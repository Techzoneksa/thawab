import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { DatabaseBackup, CheckCircle2, Download } from "lucide-react";

export const Route = createFileRoute("/settings/backup")({
  head: () => ({ meta: [{ title: "النسخ الاحتياطي — ثواب" }] }),
  component: () => {
    const backups = [
      { d: "1446/10/12 03:00", size: "1.84 GB", type: "تلقائي يومي", status: "ناجح" },
      { d: "1446/10/11 03:00", size: "1.82 GB", type: "تلقائي يومي", status: "ناجح" },
      { d: "1446/10/10 03:00", size: "1.80 GB", type: "تلقائي يومي", status: "ناجح" },
      { d: "1446/10/05 14:20", size: "1.79 GB", type: "يدوي", status: "ناجح" },
      { d: "1446/10/01 03:00", size: "1.74 GB", type: "أرشيف شهري", status: "ناجح" },
    ];
    return (
      <AppShell breadcrumb={["الرئيسية", "الإعدادات", "النسخ الاحتياطي"]} title="النسخ الاحتياطي والاستعادة"
        actions={<Btn variant="primary"><DatabaseBackup size={15} />نسخة احتياطية الآن</Btn>}
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <Card className="p-5"><div className="text-xs text-muted-foreground">آخر نسخة احتياطية</div><div className="text-xl font-extrabold mt-1">قبل 6 ساعات</div><Badge tone="success" ><CheckCircle2 size={11} className="inline ms-1" />ناجحة</Badge></Card>
          <Card className="p-5"><div className="text-xs text-muted-foreground">حجم البيانات</div><div className="text-xl font-extrabold mt-1">1.84 GB</div><div className="text-xs text-muted-foreground mt-1">مشفّرة AES-256</div></Card>
          <Card className="p-5"><div className="text-xs text-muted-foreground">موقع التخزين</div><div className="text-xl font-extrabold mt-1">السعودية</div><Badge tone="info">3 نسخ جغرافية</Badge></Card>
        </div>
        <Card className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/60"><tr className="text-right"><th className="px-4 py-3 font-semibold">التاريخ والوقت</th><th className="px-4 py-3 font-semibold">الحجم</th><th className="px-4 py-3 font-semibold">النوع</th><th className="px-4 py-3 font-semibold">الحالة</th><th className="px-4 py-3 font-semibold"></th></tr></thead>
            <tbody>
              {backups.map((b, i) => (
                <tr key={i} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-3 font-mono text-xs">{b.d}</td>
                  <td className="px-4 py-3 tabular-nums">{b.size}</td>
                  <td className="px-4 py-3">{b.type}</td>
                  <td className="px-4 py-3"><Badge tone="success">{b.status}</Badge></td>
                  <td className="px-4 py-3 flex gap-1"><button className="text-primary text-xs font-semibold"><Download size={12} className="inline" /> تنزيل</button> · <button className="text-primary text-xs font-semibold">استعادة</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </AppShell>
    );
  },
});
