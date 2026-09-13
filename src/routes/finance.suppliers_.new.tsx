import { createFileRoute } from "@tanstack/react-router";
import { SupplierForm } from "@/components/finance/SupplierForm";

export const Route = createFileRoute("/finance/suppliers_/new")({
  head: () => ({ meta: [{ title: "مورد جديد — ثواب" }] }),
  component: () => <SupplierForm />,
});
