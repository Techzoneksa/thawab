import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { BOARD_MEMBERS } from "@/data/sample";
import { UsersRound, Plus } from "lucide-react";

export const Route = createFileRoute("/memberships")({
  head: () => ({ meta: [{ title: "العضويات — ثواب" }] }),
  component: () => (
    <AppShell breadcrumb={["الرئيسية", "الموارد", "العضويات"]} title="العضويات ومجلس الإدارة"
      actions={<Btn variant="primary"><Plus size={15} />عضو جديد</Btn>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { l: "أعضاء الجمعية العمومية", v: "84" },
          { l: "مجلس الإدارة", v: "6" },
          { l: "اشتراكات نشطة", v: "78" },
          { l: "حضور آخر اجتماع", v: "92%" },
        ].map((s) => <Card key={s.l} className="p-4"><div className="text-xs text-muted-foreground">{s.l}</div><div className="text-lg font-extrabold mt-1 tabular-nums">{s.v}</div></Card>)}
      </div>
      <Card className="p-5">
        <h3 className="font-bold mb-3">مجلس الإدارة الحالي</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {BOARD_MEMBERS.map((m) => (
            <div key={m.name} className="flex items-center gap-3 rounded-xl border p-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><UsersRound size={20} /></div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{m.name}</div>
                <div className="text-xs text-muted-foreground">{m.role} · منذ {m.since}هـ</div>
              </div>
              <Badge tone="success">{m.attendance}%</Badge>
            </div>
          ))}
        </div>
      </Card>
    </AppShell>
  ),
});
