import { createFileRoute } from "@tanstack/react-router";
import { PurchaseReturnForm } from "@/components/procurement/PurchaseReturnForm";

export const Route = createFileRoute("/procurement/purchase-returns_/new")({
  head: () => ({ meta: [{ title: "مرتجع مشتريات جديد — ثواب" }] }),
  component: () => <PurchaseReturnForm />,
});
