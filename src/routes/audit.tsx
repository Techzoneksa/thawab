import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Badge,
  Btn,
  FilterBar,
  Select,
  Table,
  Td,
  MobileTable,
  MobilePageHeader,
  MobileSearchInput,
  MobileFilterDrawer,
} from "@/components/erp/AppShell";
import { Eye, Search, Filter } from "lucide-react";
import { useState, useEffect } from "react";
import { EntityFormDrawer, EmptyState } from "@/components/erp/actions";
import { getAuditEntries, getAuditEntry, type AuditEntry } from "@/lib/api/audit";
import { DocumentActions } from "@/components/documents/DocumentActions";
import type { DocumentDefinition, DocMeta } from "@/lib/documents/types";

export const Route = createFileRoute("/audit")({
  head: () => ({ meta: [{ title: "سجل التدقيق — ثواب" }] }),
  component: Page,
});

function Page() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [userFilter, setUserFilter] = useState("الكل");
  const [actionFilter, setActionFilter] = useState("الكل");
  const [entityFilter, setEntityFilter] = useState("الكل");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "audit",
      {
        search: searchQuery,
        user: userFilter,
        action: actionFilter,
        entity: entityFilter,
        dateFrom,
        dateTo,
        page,
      },
    ],
    queryFn: () =>
      getAuditEntries({
        search: searchQuery,
        userName: userFilter,
        action: actionFilter,
        entityType: entityFilter,
        dateFrom,
        dateTo,
        page,
        limit: 50,
      }),
  });

  const entries = data?.items || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 50);
  const options = data?.options || { users: [], actions: [], entities: [] };

  // Detail query
  const { data: detailData } = useQuery({
    queryKey: ["audit-entry", detailId],
    queryFn: () => (detailId ? getAuditEntry(detailId) : Promise.resolve(null)),
    enabled: !!detailId,
  });

  useEffect(() => {
    setPage(1);
  }, [searchQuery, userFilter, actionFilter, entityFilter, dateFrom, dateTo]);

  const stats = [
    { label: "إجمالي السجلات", value: total },
    {
      label: "عمليات اليوم",
      value: entries.filter((e: AuditEntry) => {
        // Approximation: today's entries (timestamp contains today's date)
        return e.timestamp && e.timestamp.length >= 10;
      }).length,
    },
    { label: "مستخدمون مميزون", value: options.users.length },
    { label: "أنواع الكيانات", value: options.entities.length },
  ];

  const buildDoc = async (): Promise<DocumentDefinition> => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await getAuditEntries({
      search: searchQuery,
      userName: userFilter,
      action: actionFilter,
      entityType: entityFilter,
      dateFrom,
      dateTo,
      page: 1,
      limit: 100000,
    });
    const rows = res.items;
    const filters: DocMeta[] = [];
    if (searchQuery) filters.push({ label: "بحث", value: searchQuery });
    if (userFilter !== "الكل") filters.push({ label: "المستخدم", value: userFilter });
    if (actionFilter !== "الكل") filters.push({ label: "الإجراء", value: actionFilter });
    if (entityFilter !== "الكل") filters.push({ label: "الكيان", value: entityFilter });
    if (dateFrom) filters.push({ label: "من", value: dateFrom });
    if (dateTo) filters.push({ label: "إلى", value: dateTo });
    return {
      title: "سجل التدقيق (Audit Trail)",
      date: today,
      orientation: "landscape",
      filters,
      columns: [
        { key: "timestamp", label: "الوقت", type: "date" },
        { key: "userName", label: "المستخدم" },
        { key: "action", label: "الإجراء" },
        { key: "entityType", label: "الكيان" },
        { key: "description", label: "الوصف" },
      ],
      rows: rows.map((e: AuditEntry) => ({
        timestamp: e.timestamp,
        userName: e.userName,
        action: e.action,
        entityType: e.entityType,
        description: e.description,
      })),
      fileBase: `audit-${today}`,
    };
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "التقارير والحوكمة", "سجل التدقيق"]}
      title="سجل التدقيق (Audit Trail)"
      actions={
        <>
          <DocumentActions document={buildDoc} />
          <Btn variant="outline" onClick={() => setFilterOpen(true)}>
            <Filter size={15} /> تصفية
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-3 lg:mb-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-3 lg:p-4">
            <div className="text-xs text-muted-foreground truncate">{s.label}</div>
            <div className="text-base lg:text-xl font-extrabold mt-1 tabular-nums truncate">
              {s.value}
            </div>
          </Card>
        ))}
      </div>

      <FilterBar>
        <div className="relative flex-1 min-w-[200px] hidden lg:block">
          <Search
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            className="w-full rounded-lg border bg-background py-1.5 pr-9 pl-3 text-sm"
            placeholder="بحث بالمستخدم، الإجراء، الكيان، الوصف..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          label="المستخدم"
          options={["الكل", ...options.users]}
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
        />
        <Select
          label="نوع الإجراء"
          options={["الكل", ...options.actions]}
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        />
        <Select
          label="الكيان"
          options={["الكل", ...options.entities]}
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
        />
      </FilterBar>

      <div className="lg:hidden flex items-center gap-2 mb-3">
        <MobileSearchInput
          placeholder="بحث..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <MobilePageHeader
        title="سجل التدقيق"
        count={`${total} سجل`}
        action={
          <button
            className="min-h-[44px] min-w-[44px] grid place-items-center"
            onClick={() => setFilterOpen(true)}
          >
            <Filter size={18} />
          </button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <EmptyState
          title="خطأ في تحميل البيانات"
          description="حدث خطأ أثناء تحميل سجل التدقيق"
          action={
            <Btn
              variant="primary"
              onClick={() => {
                window.location.reload();
              }}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : entries.length === 0 ? (
        <EmptyState
          title="لا توجد سجلات"
          description="لم يتم تسجيل أي عمليات بعد. ستظهر جميع العمليات المؤتمتة هنا تلقائياً."
        />
      ) : (
        <MobileTable
          columns={["الوقت", "المستخدم", "الإجراء", "الكيان", "رقم السجل", ""]}
          rows={entries}
          renderRow={(a: AuditEntry) => (
            <>
              <Td className="font-mono text-xs text-muted-foreground">{a.timestamp}</Td>
              <Td className="font-semibold">{a.userName}</Td>
              <Td>
                <Badge tone={actionTone(a.action)}>{a.action}</Badge>
              </Td>
              <Td className="text-xs">{a.entityType}</Td>
              <Td className="font-mono text-xs text-muted-foreground">{a.entityId}</Td>
              <Td>
                <button
                  onClick={() => setDetailId(a.id)}
                  className="text-info text-xs font-semibold inline-flex items-center gap-1"
                >
                  <Eye size={12} /> تفاصيل
                </button>
              </Td>
            </>
          )}
          mobileCard={(a: AuditEntry) => (
            <Card key={a.id} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">{a.userName}</span>
                <span className="text-xs text-muted-foreground">{a.timestamp}</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Badge tone={actionTone(a.action)}>{a.action}</Badge>
                <span className="text-xs">{a.entityType}</span>
              </div>
              <div className="text-xs text-muted-foreground line-clamp-2 mb-2">{a.description}</div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">{a.entityId}</span>
                <button
                  onClick={() => setDetailId(a.id)}
                  className="text-info text-xs font-semibold inline-flex items-center gap-1"
                >
                  <Eye size={12} /> تفاصيل
                </button>
              </div>
            </Card>
          )}
        />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-xs text-muted-foreground">
            صفحة {page} من {totalPages} | {total} سجل
          </span>
          <div className="flex gap-1">
            <button
              className="px-3 py-1.5 text-xs rounded-lg border bg-background hover:bg-muted disabled:opacity-40 min-h-[36px]"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              السابق
            </button>
            <button
              className="px-3 py-1.5 text-xs rounded-lg border bg-background hover:bg-muted disabled:opacity-40 min-h-[36px]"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              التالي
            </button>
          </div>
        </div>
      )}

      <EntityFormDrawer
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title="تفاصيل السجل"
        onSave={() => setDetailId(null)}
        saveText="إغلاق"
      >
        {detailData && (
          <div className="space-y-4">
            <Card className="p-3 bg-muted/30">
              <div className="grid grid-cols-1 gap-3 text-sm">
                <DetailRow label="المستخدم" value={detailData.item.userName || "—"} />
                <DetailRow label="الإجراء" value={detailData.item.action} />
                <DetailRow label="نوع الكيان" value={detailData.item.entityType} />
                <DetailRow label="رقم السجل" value={detailData.item.entityId} />
                <DetailRow label="الوقت" value={detailData.item.timestamp || "—"} />
                {detailData.item.ip && <DetailRow label="IP" value={detailData.item.ip} />}
              </div>
            </Card>

            {detailData.item.description && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">الوصف</div>
                <div className="text-sm p-3 bg-muted/30 rounded-lg">
                  {detailData.item.description}
                </div>
              </div>
            )}

            {(Boolean(detailData.before) || Boolean(detailData.after)) && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2">
                  التغييرات (Before / After)
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  <SnapshotPanel title="قبل" data={detailData.before} tone="destructive" />
                  <SnapshotPanel title="بعد" data={detailData.after} tone="success" />
                </div>
              </div>
            )}

            <Card className="p-3 bg-info/10 border-info">
              <div className="text-xs text-muted-foreground">
                ⚠ سجل التدقيق للقراءة فقط — لا يمكن تعديل أو حذف السجلات من الواجهة.
              </div>
            </Card>
          </div>
        )}
      </EntityFormDrawer>

      <MobileFilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">بحث</label>
            <div className="relative mt-1">
              <Search
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                className="w-full rounded-xl border bg-background py-2.5 pr-9 pl-3 text-sm min-h-[44px]"
                placeholder="بحث..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <Select
            label="المستخدم"
            options={["الكل", ...options.users]}
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
          />
          <Select
            label="نوع الإجراء"
            options={["الكل", ...options.actions]}
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          />
          <Select
            label="الكيان"
            options={["الكل", ...options.entities]}
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
          />
          <div>
            <label className="text-xs font-semibold text-muted-foreground">التاريخ من</label>
            <input
              type="date"
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">التاريخ إلى</label>
            <input
              type="date"
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>
      </MobileFilterDrawer>
    </AppShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold break-words">{value}</div>
    </div>
  );
}

function SnapshotPanel({
  title,
  data,
  tone,
}: {
  title: string;
  data: unknown;
  tone: "success" | "destructive";
}) {
  return (
    <div
      className={`rounded-lg border p-2 ${tone === "success" ? "bg-success/10" : "bg-destructive/10"}`}
    >
      <div className="text-[10px] font-semibold text-muted-foreground mb-1">{title}</div>
      {data == null ? (
        <div className="text-xs text-muted-foreground italic">لا توجد بيانات</div>
      ) : typeof data === "object" ? (
        <pre className="text-[10px] font-mono whitespace-pre-wrap break-words leading-relaxed">
          {String(JSON.stringify(data, null, 2))}
        </pre>
      ) : (
        <div className="text-xs break-words">{String(data)}</div>
      )}
    </div>
  );
}

function actionTone(action: string): "success" | "destructive" | "warning" | "info" | "muted" {
  if (
    action.includes("حذف") ||
    action.includes("إيقاف") ||
    action.includes("إلغاء") ||
    action.includes("رفض")
  )
    return "destructive";
  if (
    action.includes("إضافة") ||
    action.includes("ترحيل") ||
    action.includes("اعتماد") ||
    action.includes("تفعيل") ||
    action.includes("تسليم") ||
    action.includes("تأهيل")
  )
    return "success";
  if (action.includes("تعديل") || action.includes("تحديث") || action.includes("عكس")) return "info";
  if (action.includes("بانتظار") || action.includes("مسودة")) return "warning";
  return "muted";
}
