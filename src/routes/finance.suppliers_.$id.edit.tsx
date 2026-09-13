import { createFileRoute, useParams } from "@tanstack/react-router";
import { SupplierForm } from "@/components/finance/SupplierForm";

export const Route = createFileRoute("/finance/suppliers_/$id/edit")({
  head: () => ({ meta: [{ title: "تعديل مورد — ثواب" }] }),
  component: EditSupplierPage,
});

function EditSupplierPage() {
  const { id } = useParams({ from: "/finance/suppliers_/$id/edit" });
  return <SupplierForm supplierId={id} />;
}
