import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge, statusTone } from "@/components/erp/AppShell";
import { MEETINGS } from "@/data/sample";
import { CalendarDays, Plus, Vote, Paperclip } from "lucide-react";

export const Route = createFileRoute("/meetings")({
  head: () => ({ meta: [{ title: "الاجتماعات — ثواب" }] }),
  component: () => (
    <AppShell breadcrumb={["الرئيسية", "الموارد", "الاجتماعات"]} title="الاجتماعات والقرارات"
      actions={<Btn variant="primary"><Plus size={15} />اجتماع جديد</Btn>}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {MEETINGS.map((m) => (
          <Card key={m.id} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><CalendarDays size={20} /></div>
                <div className="min-w-0"><h3 className="font-bold">{m.title}</h3><div className="text-xs text-muted-foreground">{m.date}هـ · {m.attendees} حاضر</div></div>
              </div>
              <Badge tone={statusTone(m.status)}>{m.status}</Badge>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4 text-center">
              <div className="rounded-lg bg-muted/60 p-2"><div className="text-[10px] text-muted-foreground">قرارات</div><div className="text-sm font-bold mt-0.5">{m.decisions}</div></div>
              <div className="rounded-lg bg-muted/60 p-2"><div className="text-[10px] text-muted-foreground">تصويتات</div><div className="text-sm font-bold mt-0.5 inline-flex items-center gap-1"><Vote size={12} /> {m.decisions}</div></div>
              <div className="rounded-lg bg-muted/60 p-2"><div className="text-[10px] text-muted-foreground">مرفقات</div><div className="text-sm font-bold mt-0.5 inline-flex items-center gap-1"><Paperclip size={12} /> {m.status === "منعقد" ? 3 : 0}</div></div>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  ),
});
