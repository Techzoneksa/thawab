import { createFileRoute } from "@tanstack/react-router";
import { PurchaseOrderForm } from "@/components/procurement/PurchaseOrderForm";

export const Route = createFileRoute("/procurement/purchase-orders_/new")({
  head: () => ({ meta: [{ title: "أمر شراء جديد — ثواب" }] }),
  component: () => <PurchaseOrderForm />,
});
