import { createFileRoute } from "@tanstack/react-router";
import { CashBankForm } from "@/components/finance/CashBankForm";

type Kind = "cash" | "bank";
const parseKind = (s: Record<string, unknown>): { kind: Kind } => ({
  kind: s.kind === "bank" ? "bank" : "cash",
});

export const Route = createFileRoute("/finance/cash-bank_/new")({
  head: () => ({ meta: [{ title: "إضافة نقد/بنك — ثواب" }] }),
  validateSearch: parseKind,
  component: NewCashBankPage,
});

function NewCashBankPage() {
  const { kind } = Route.useSearch();
  return <CashBankForm kind={kind} />;
}
