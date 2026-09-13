import { createFileRoute } from "@tanstack/react-router";
import { CustomerForm } from "@/components/finance/CustomerForm";

export const Route = createFileRoute("/finance/customers_/new")({
  head: () => ({ meta: [{ title: "عميل جديد — ثواب" }] }),
  component: () => <CustomerForm />,
});
