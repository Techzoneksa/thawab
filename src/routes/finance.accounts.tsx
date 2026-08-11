import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Badge,
  FilterBar,
  Select,
  Btn,
  Table,
  Td,
  statusTone,
  MobilePageHeader,
  MobileSearchInput,
  MobileFilterDrawer,
} from "@/components/erp/AppShell";
import { fmtSAR, fmtNum } from "@/data/sample";
import {
  Plus,
  Search,
  Filter,
  Eye,
  Pencil,
  Trash2,
  Pause,
  Play,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import {
  showToast,
  ConfirmDialog,
  ActionMenu,
  EmptyState,
} from "@/components/erp/actions";
import { DocumentActions } from "@/components/documents/DocumentActions";
import type { DocumentDefinition, DocMeta } from "@/lib/documents/types";
import { useAuth } from "@/lib/api/auth";
import { label, options } from "@/lib/i18n/labels";
import { AccountStatus } from "@/lib/enums";
import {
  getAccounts,
  deleteAccount,
  deactivateAccount,
  activateAccount,
  type Account,
} from "@/lib/api/accounts";

export const Route = createFileRoute("/finance/accounts")({
  head: () => ({ meta: [{ title: "دليل الحسابات — ثواب" }] }),
  component: Page,
});

/**
 * The account's accounting nature is stored in the `classification` column
 * (English enum key). The client `Account` type is not yet migrated off `type`,
 * so read it safely here.
 */
function acctClassification(a: Account): string {
  return (a as unknown as { classification?: string }).classification ?? "";
}

function Page() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<{
    id: string;
    name: string;
    action: "deactivate" | "activate";
  } | null>(null);
  const [view, setView] = useState<"tree" | "table">("tree");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["accounts", { search: searchQuery, type: typeFilter, status: statusFilter }],
    queryFn: () => getAccounts({ search: searchQuery, type: typeFilter, status: statusFilter }),
  });

  const accounts = data?.items || [];
  const total = data?.total || 0;

  const selectedAccount = useMemo(
    () => accounts.find((a: Account) => a.id === selectedId) || null,
    [accounts, selectedId],
  );

  const childrenOf = useMemo(() => {
    const map = new Map<string, Account[]>();
    for (const a of accounts) {
      if (a.parentId) {
        if (!map.has(a.parentId)) map.set(a.parentId, []);
        map.get(a.parentId)!.push(a);
      }
    }
    return map;
  }, [accounts]);

  const roots = useMemo(
    () => accounts.filter((a: Account) => !a.parentId).sort((a, b) => a.code.localeCompare(b.code)),
    [accounts],
  );

  // Expand all by default on first load
  useEffect(() => {
    if (expanded.size === 0 && roots.length > 0) {
      const all = new Set<string>();
      const walk = (a: Account) => {
        all.add(a.id);
        childrenOf.get(a.id)?.forEach(walk);
      };
      roots.forEach(walk);
      setExpanded(all);
    }
  }, [roots, childrenOf, expanded.size]);

  const openAdd = (parent?: Account | null) => {
    navigate({
      to: "/finance/accounts/new",
      search: parent?.id ? { parent: parent.id } : {},
    });
  };

  const openEdit = (a: Account) => {
    navigate({ to: "/finance/accounts/$id/edit", params: { id: a.id } });
  };

  const deleteMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      showToast("تم حذف الحساب بنجاح", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const statusMutation = useMutation({
    mutationFn: async (vars: {
      id: string;
      action: "deactivate" | "activate";
      userId?: string;
      userName?: string;
    }) => {
      const fn = vars.action === "deactivate" ? deactivateAccount : activateAccount;
      return fn({ id: vars.id, userId: vars.userId, userName: vars.userName });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      showToast(vars.action === "deactivate" ? "تم إيقاف الحساب" : "تم تفعيل الحساب", "success");
      setStatusTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate({ id: deleteTarget, userId: user?.id, userName: user?.name });
    }
  };

  const handleStatusConfirm = () => {
    if (statusTarget) {
      statusMutation.mutate({
        id: statusTarget.id,
        action: statusTarget.action,
        userId: user?.id,
        userName: user?.name,
      });
    }
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const buildDoc = (): DocumentDefinition => {
    const today = new Date().toISOString().slice(0, 10);
    const filters: DocMeta[] = [];
    if (searchQuery) filters.push({ label: "بحث", value: searchQuery });
    if (typeFilter)
      filters.push({ label: "التصنيف", value: label("accountClassification", typeFilter) });
    if (statusFilter) filters.push({ label: "الحالة", value: label("accountStatus", statusFilter) });
    return {
      title: "دليل الحسابات",
      date: today,
      orientation: "landscape",
      filters,
      columns: [
        { key: "code", label: "الرمز", width: "15%" },
        { key: "name", label: "اسم الحساب", width: "45%" },
        { key: "classification", label: "التصنيف", width: "20%" },
        { key: "status", label: "الحالة", width: "20%" },
      ],
      rows: accounts.map((a: Account) => ({
        code: a.code,
        name: a.name,
        classification: label("accountClassification", acctClassification(a)),
        status: label("accountStatus", a.status),
      })),
      fileBase: `accounts-${today}`,
    };
  };

  const stats = [
    { label: "إجمالي الحسابات", value: fmtNum(total) },
    {
      label: "حسابات نشطة",
      value: accounts.filter((a: Account) => a.status === AccountStatus.ACTIVE).length,
    },
    {
      label: "قابلة للترحيل",
      value: accounts.filter((a: Account) => a.postable).length,
    },
    {
      label: "حسابات رئيسية",
      value: accounts.filter((a: Account) => a.level === 1).length,
    },
  ];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "دليل الحسابات"]}
      title="دليل الحسابات"
      actions={
        <>
          <div className="hidden lg:flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setView("tree")}
              className={`px-3 py-2 ${view === "tree" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              الشجرة
            </button>
            <button
              onClick={() => setView("table")}
              className={`px-3 py-2 ${view === "table" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              القائمة
            </button>
          </div>
          <DocumentActions document={buildDoc} />
          <Btn variant="primary" onClick={() => openAdd()}>
            <Plus size={15} /> حساب جديد
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
            placeholder="بحث بالرقم أو الاسم..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          label="التصنيف"
          options={["الكل", ...options("accountClassification").map((o) => o.label)]}
          value={typeFilter ? label("accountClassification", typeFilter) : "الكل"}
          onChange={(e) => {
            const v = e.target.value;
            setTypeFilter(
              v === "الكل"
                ? ""
                : (options("accountClassification").find((o) => o.label === v)?.value ?? ""),
            );
          }}
        />
        <Select
          label="الحالة"
          options={["الكل", ...options("accountStatus").map((o) => o.label)]}
          value={statusFilter ? label("accountStatus", statusFilter) : "الكل"}
          onChange={(e) => {
            const v = e.target.value;
            setStatusFilter(
              v === "الكل"
                ? ""
                : (options("accountStatus").find((o) => o.label === v)?.value ?? ""),
            );
          }}
        />
        <Btn variant="ghost" className="lg:hidden" onClick={() => setFilterOpen(true)}>
          <Filter size={15} />
        </Btn>
      </FilterBar>

      <div className="lg:hidden flex items-center gap-2 mb-3">
        <MobileSearchInput
          placeholder="بحث..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <MobilePageHeader
        title="دليل الحسابات"
        count={`${fmtNum(total)} حساب`}
        action={
          <Btn variant="primary" onClick={() => openAdd()}>
            <Plus size={15} />
          </Btn>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <EmptyState
          title="خطأ في تحميل البيانات"
          description="حدث خطأ أثناء تحميل الحسابات"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["accounts"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : accounts.length === 0 ? (
        <EmptyState
          title="لا توجد حسابات"
          description="ابدأ بإضافة أول حساب"
          action={
            <Btn variant="primary" onClick={() => openAdd()}>
              إضافة حساب
            </Btn>
          }
        />
      ) : view === "tree" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="space-y-1">
              {roots.map((root: Account) => (
                <TreeNode
                  key={root.id}
                  account={root}
                  childrenOf={childrenOf}
                  expanded={expanded}
                  selectedId={selectedId}
                  onToggle={toggleExpand}
                  onSelect={setSelectedId}
                  onAdd={(a) => openAdd(a)}
                  onEdit={openEdit}
                  onDelete={(id) => setDeleteTarget(id)}
                  onDeactivate={(a) =>
                    setStatusTarget({
                      id: a.id,
                      name: `${a.code} - ${a.name}`,
                      action: "deactivate",
                    })
                  }
                  onActivate={(a) =>
                    setStatusTarget({ id: a.id, name: `${a.code} - ${a.name}`, action: "activate" })
                  }
                  level={0}
                />
              ))}
            </div>
          </Card>
          <Card className="p-4 lg:p-5">
            {selectedAccount ? (
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="text-base lg:text-lg font-bold">
                      {selectedAccount.code} — {selectedAccount.name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {label("accountClassification", acctClassification(selectedAccount))} · المستوى{" "}
                      {selectedAccount.level}
                      {selectedAccount.parentId && (
                        <>
                          {" "}
                          ·{" "}
                          <span className="font-mono">
                            {accounts.find((a: Account) => a.id === selectedAccount.parentId)
                              ?.code || ""}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={statusTone(selectedAccount.status)}>
                      {label("accountStatus", selectedAccount.status)}
                    </Badge>
                    {selectedAccount.postable ? (
                      <Badge tone="info">قابل للترحيل</Badge>
                    ) : (
                      <Badge tone="muted">رئيسي</Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <Stat label="الرصيد" value={fmtSAR(selectedAccount.balance)} />
                  <Stat label="العملة" value={selectedAccount.currency} />
                </div>

                {selectedAccount.description && (
                  <div className="mt-4">
                    <div className="text-xs font-semibold text-muted-foreground">الوصف</div>
                    <div className="text-sm mt-1">{selectedAccount.description}</div>
                  </div>
                )}

                <div className="mt-4 border-t pt-3">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">
                    الحسابات الفرعية ({childrenOf.get(selectedAccount.id)?.length || 0})
                  </div>
                  {childrenOf.get(selectedAccount.id)?.length ? (
                    <div className="space-y-1">
                      {childrenOf.get(selectedAccount.id)!.map((c: Account) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between rounded-lg border p-2 hover:bg-muted/50"
                        >
                          <button
                            onClick={() => setSelectedId(c.id)}
                            className="text-right text-sm font-semibold hover:text-primary flex-1"
                          >
                            <span className="font-mono">{c.code}</span> — {c.name}
                          </button>
                          <Badge tone={statusTone(c.status)}>{label("accountStatus", c.status)}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">لا توجد حسابات فرعية</div>
                  )}
                </div>

                <div className="mt-4 flex gap-2">
                  <Btn variant="outline" onClick={() => openEdit(selectedAccount)}>
                    <Pencil size={14} /> تعديل
                  </Btn>
                  <Btn variant="outline" onClick={() => openAdd(selectedAccount)}>
                    <Plus size={14} /> إضافة فرعي
                  </Btn>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                اختر حساباً من الشجرة لعرض التفاصيل
              </div>
            )}
          </Card>
        </div>
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table
            columns={["الرقم", "الاسم", "النوع", "المستوى", "الأب", "الرصيد", "الحالة", ""]}
            rows={accounts}
            renderRow={(a: Account) => (
              <>
                <Td className="font-mono text-xs">{a.code}</Td>
                <Td>
                  <button
                    onClick={() => setSelectedId(a.id)}
                    className="font-semibold hover:text-primary text-right"
                  >
                    {a.name}
                  </button>
                </Td>
                <Td>{label("accountClassification", acctClassification(a))}</Td>
                <Td className="tabular-nums">{a.level}</Td>
                <Td className="font-mono text-xs text-muted-foreground">
                  {a.parentId
                    ? accounts.find((x: Account) => x.id === a.parentId)?.code || "—"
                    : "—"}
                </Td>
                <Td className="tabular-nums">{fmtSAR(a.balance)}</Td>
                <Td>
                  <Badge tone={statusTone(a.status)}>{label("accountStatus", a.status)}</Badge>
                </Td>
                <Td>
                  <ActionMenu
                    actions={getAccountActions(a, setStatusTarget, openEdit, setDeleteTarget)}
                  />
                </Td>
              </>
            )}
          />
        </Card>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف الحساب"
        message="هل أنت متأكد من حذف هذا الحساب؟ سيتم الحذف فقط إذا لم يكن له فروع أو حركات."
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />

      <ConfirmDialog
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        onConfirm={handleStatusConfirm}
        title={
          statusTarget
            ? statusTarget.action === "deactivate"
              ? "إيقاف الحساب"
              : "تفعيل الحساب"
            : ""
        }
        message={
          statusTarget
            ? `هل تريد ${statusTarget.action === "deactivate" ? "إيقاف" : "تفعيل"} الحساب "${statusTarget.name}"؟`
            : ""
        }
        confirmText={statusTarget ? (statusTarget.action === "deactivate" ? "إيقاف" : "تفعيل") : ""}
        cancelText="إلغاء"
        variant="default"
      />

      <MobileFilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">التصنيف</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">الكل</option>
              {options("accountClassification").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الحالة</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">الكل</option>
              {options("accountStatus").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </MobileFilterDrawer>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/60 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function TreeNode({
  account,
  childrenOf,
  expanded,
  selectedId,
  onToggle,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  onDeactivate,
  onActivate,
  level,
}: {
  account: Account;
  childrenOf: Map<string, Account[]>;
  expanded: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onAdd: (a: Account) => void;
  onEdit: (a: Account) => void;
  onDelete: (id: string) => void;
  onDeactivate: (a: Account) => void;
  onActivate: (a: Account) => void;
  level: number;
}) {
  const kids = childrenOf.get(account.id) || [];
  const isExpanded = expanded.has(account.id);
  const isSelected = selectedId === account.id;
  return (
    <div>
      <div
        className={`flex items-center gap-2 rounded-lg p-2 cursor-pointer ${isSelected ? "bg-primary/15 border border-primary/30" : "hover:bg-muted/50"}`}
        style={{ paddingRight: `${level * 16 + 8}px` }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(account.id);
          }}
          className="text-muted-foreground hover:text-foreground"
        >
          {kids.length > 0 ? (
            isExpanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : (
            <span className="w-[14px] inline-block" />
          )}
        </button>
        <button onClick={() => onSelect(account.id)} className="flex-1 text-right">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{account.code}</span>
            <span className={`text-sm ${isSelected ? "font-bold" : "font-medium"}`}>
              {account.name}
            </span>
            {account.postable ? (
              <span className="text-[10px] text-muted-foreground">قابل للترحيل</span>
            ) : null}
          </div>
        </button>
        <Badge tone={statusTone(account.status)}>{label("accountStatus", account.status)}</Badge>
        <ActionMenu
          actions={getAccountActionsInline(
            account,
            onAdd,
            onEdit,
            onDelete,
            onDeactivate,
            onActivate,
          )}
        />
      </div>
      {isExpanded &&
        kids.map((k: Account) => (
          <TreeNode
            key={k.id}
            account={k}
            childrenOf={childrenOf}
            expanded={expanded}
            selectedId={selectedId}
            onToggle={onToggle}
            onSelect={onSelect}
            onAdd={onAdd}
            onEdit={onEdit}
            onDelete={onDelete}
            onDeactivate={onDeactivate}
            onActivate={onActivate}
            level={level + 1}
          />
        ))}
    </div>
  );
}

function getAccountActionsInline(
  a: Account,
  onAdd: (a: Account) => void,
  onEdit: (a: Account) => void,
  onDelete: (id: string) => void,
  onDeactivate: (a: Account) => void,
  onActivate: (a: Account) => void,
) {
  const actions: Array<{
    label: string;
    icon: any;
    onClick: () => void;
    variant?: "destructive";
  }> = [];

  if (!a.postable) {
    actions.push({ label: "إضافة حساب فرعي", icon: Plus, onClick: () => onAdd(a) });
  }
  actions.push({ label: "تعديل", icon: Pencil, onClick: () => onEdit(a) });
  if (a.status === AccountStatus.ACTIVE) {
    actions.push({
      label: "إيقاف",
      icon: Pause,
      onClick: () => onDeactivate(a),
    });
  } else if (a.status === AccountStatus.INACTIVE) {
    actions.push({
      label: "تفعيل",
      icon: Play,
      onClick: () => onActivate(a),
    });
  }
  actions.push({
    label: "حذف",
    icon: Trash2,
    onClick: () => onDelete(a.id),
    variant: "destructive",
  });
  return actions;
}

function getAccountActions(
  a: Account,
  setStatusTarget: (t: { id: string; name: string; action: "deactivate" | "activate" }) => void,
  openEdit: (a: Account) => void,
  setDeleteTarget: (id: string) => void,
) {
  const actions: Array<{
    label: string;
    icon: any;
    onClick: () => void;
    variant?: "destructive";
  }> = [{ label: "عرض التفاصيل", icon: Eye, onClick: () => {} }];
  actions.push({ label: "تعديل", icon: Pencil, onClick: () => openEdit(a) });
  if (a.status === AccountStatus.ACTIVE) {
    actions.push({
      label: "إيقاف",
      icon: Pause,
      onClick: () =>
        setStatusTarget({ id: a.id, name: `${a.code} - ${a.name}`, action: "deactivate" }),
    });
  } else if (a.status === AccountStatus.INACTIVE) {
    actions.push({
      label: "تفعيل",
      icon: Play,
      onClick: () =>
        setStatusTarget({ id: a.id, name: `${a.code} - ${a.name}`, action: "activate" }),
    });
  }
  actions.push({
    label: "حذف",
    icon: Trash2,
    onClick: () => setDeleteTarget(a.id),
    variant: "destructive",
  });
  return actions;
}
