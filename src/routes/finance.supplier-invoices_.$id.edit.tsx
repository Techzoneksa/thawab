import { createFileRoute, useParams } from "@tanstack/react-router";
import { SupplierInvoiceForm } from "@/components/finance/SupplierInvoiceForm";

export const Route = createFileRoute("/finance/supplier-invoices_/$id/edit")({
  head: () => ({ meta: [{ title: "تعديل فاتورة مورد — ثواب" }] }),
  component: EditSupplierInvoicePage,
});

function EditSupplierInvoicePage() {
  const { id } = useParams({ from: "/finance/supplier-invoices_/$id/edit" });
  return <SupplierInvoiceForm invoiceId={id} />;
}
