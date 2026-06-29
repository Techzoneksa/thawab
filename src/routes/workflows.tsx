import { createFileRoute } from "@tanstack/react-router";
import {
  AppShell,
  Card,
  Badge,
  Btn,
  statusTone,
  MobilePageHeader,
} from "@/components/erp/AppShell";
import { WORKFLOWS } from "@/data/sample";
import { GitBranch, Plus, ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/workflows")({
  head: () => ({ meta: [{ title: "سير العمل — ثواب" }] }),
  component: Page,
});

function Page() {
  return (
    <AppShell
      breadcrumb={["الرئيسية", "التقارير والحوكمة", "سير العمل"]}
      title="محرّك سير العمل والاعتمادات"
      actions={
        <Btn variant="primary">
          <Plus size={15} />
          سير عمل جديد
        </Btn>
      }
    >
      <MobilePageHeader title="محرّك سير العمل والاعتمادات" count={`${WORKFLOWS.length} سير عمل`} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {WORKFLOWS.map((w) => (
          <Card key={w.name} className="p-5">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h3 className="font-bold">{w.name}</h3>
                <div className="text-xs text-muted-foreground mt-1">
                  متوسط الزمن: {w.avg} · جاري حالياً: {w.active}
                </div>
              </div>
              <Badge tone="success">مفعّل</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {w.steps.map((s, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">{s}</span>
                  {i < w.steps.length - 1 && (
                    <ChevronLeft size={14} className="text-muted-foreground" />
                  )}
                </span>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <Btn variant="outline">
                <GitBranch size={14} />
                تعديل
              </Btn>
              <Btn variant="ghost">عرض السجل</Btn>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
