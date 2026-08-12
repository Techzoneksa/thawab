export interface ReportSummary {
  donations: { total: number; count: number };
  donors: { count: number };
  beneficiaries: { count: number; active: number };
  aid: { disbursed: number; count: number };
  projects: { count: number; budget: number; spent: number };
  campaigns: { count: number; raised: number };
  grants: { count: number; total: number };
  hr: { count: number; active: number; monthlyPayroll: number };
}

export async function getReportSummary(): Promise<{ summary: ReportSummary }> {
  const res = await fetch("/api/reports/summary");
  if (!res.ok) throw new Error("فشل في جلب ملخص التقارير");
  return res.json();
}
