import { createFileRoute, useParams } from "@tanstack/react-router";
import { CashBankForm } from "@/components/finance/CashBankForm";

type Kind = "cash" | "bank";
const parseKind = (s: Record<string, unknown>): { kind: Kind } => ({
  kind: s.kind === "bank" ? "bank" : "cash",
});

export const Route = createFileRoute("/finance/cash-bank_/$id/edit")({
  head: () => ({ meta: [{ title: "تعديل نقد/بنك — ثواب" }] }),
  validateSearch: parseKind,
  component: EditCashBankPage,
});

function EditCashBankPage() {
  const { id } = useParams({ from: "/finance/cash-bank_/$id/edit" });
  const { kind } = Route.useSearch();
  return <CashBankForm kind={kind} id={id} />;
}
