import type { ReactNode } from "react";
import { AppShell, Card, Badge, Btn, FilterBar, Select, Table, Td, statusTone } from "./AppShell";
import { Plus, Download, Search } from "lucide-react";

export type Col = { key: string; label: string; render?: (v: any, row: any) => ReactNode; mono?: boolean; bold?: boolean; muted?: boolean; status?: boolean; money?: boolean };

import { fmtSAR } from "@/data/sample";

export function ListPage({
  breadcrumb, title, kpis = [], filters = [], cols, rows, createLabel = "إضافة جديد",
}: {
  breadcrumb: string[];
  title: string;
  kpis?: { label: string; value: string; tone?: string }[];
  filters?: { label: string; options: string[] }[];
  cols: Col[];
  rows: any[];
  createLabel?: string;
}) {
  return (
    <AppShell breadcrumb={breadcrumb} title={title}
      actions={<><Btn variant="outline"><Download size={15} />تصدير</Btn><Btn variant="primary"><Plus size={15} />{createLabel}</Btn></>}
    >
      {kpis.length > 0 && (
        <div className={`grid grid-cols-2 lg:grid-cols-${Math.min(kpis.length, 5)} gap-3 mb-4`}>
          {kpis.map((k) => (
            <Card key={k.label} className="p-4">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className="text-lg font-extrabold mt-1 tabular-nums">{k.value}</div>
            </Card>
          ))}
        </div>
      )}
      <FilterBar>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full rounded-lg border bg-background py-1.5 pr-9 pl-3 text-sm" placeholder="بحث..." />
        </div>
        {filters.map((f) => <Select key={f.label} label={f.label} options={f.options} />)}
      </FilterBar>
      <Table
        columns={cols.map((c) => c.label)}
        rows={rows}
        renderRow={(r) => (
          <>
            {cols.map((c) => {
              const v = r[c.key];
              let content: ReactNode = v;
              if (c.render) content = c.render(v, r);
              else if (c.status) content = <Badge tone={statusTone(String(v))}>{String(v)}</Badge>;
              else if (c.money) content = fmtSAR(Number(v));
              return (
                <Td key={c.key} className={`${c.mono ? "font-mono text-xs" : ""} ${c.bold ? "font-bold tabular-nums" : ""} ${c.muted ? "text-muted-foreground" : ""}`}>
                  {content}
                </Td>
              );
            })}
          </>
        )}
      />
    </AppShell>
  );
}
