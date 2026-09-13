import { createFileRoute, useParams } from "@tanstack/react-router";
import { SalesInvoiceForm } from "@/components/finance/SalesInvoiceForm";

export const Route = createFileRoute("/finance/sales-invoices_/$id/edit")({
  head: () => ({ meta: [{ title: "تعديل فاتورة مبيعات — ثواب" }] }),
  component: EditSalesInvoicePage,
});

function EditSalesInvoicePage() {
  const { id } = useParams({ from: "/finance/sales-invoices_/$id/edit" });
  return <SalesInvoiceForm invoiceId={id} />;
}
