import { createFileRoute, useParams } from "@tanstack/react-router";
import { CustomerForm } from "@/components/finance/CustomerForm";

export const Route = createFileRoute("/finance/customers_/$id/edit")({
  head: () => ({ meta: [{ title: "تعديل عميل — ثواب" }] }),
  component: EditCustomerPage,
});

function EditCustomerPage() {
  const { id } = useParams({ from: "/finance/customers_/$id/edit" });
  return <CustomerForm customerId={id} />;
}
