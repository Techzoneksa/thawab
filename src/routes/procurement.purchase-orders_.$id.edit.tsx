import { createFileRoute, useParams } from "@tanstack/react-router";
import { PurchaseOrderForm } from "@/components/procurement/PurchaseOrderForm";

export const Route = createFileRoute("/procurement/purchase-orders_/$id/edit")({
  head: () => ({ meta: [{ title: "تعديل أمر شراء — ثواب" }] }),
  component: EditPurchaseOrderPage,
});

function EditPurchaseOrderPage() {
  const { id } = useParams({ from: "/procurement/purchase-orders_/$id/edit" });
  return <PurchaseOrderForm id={id} />;
}
