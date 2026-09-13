import { createFileRoute } from "@tanstack/react-router";
import { SupplierInvoiceForm } from "@/components/finance/SupplierInvoiceForm";

export const Route = createFileRoute("/finance/supplier-invoices_/new")({
  head: () => ({ meta: [{ title: "فاتورة مورد جديدة — ثواب" }] }),
  component: () => <SupplierInvoiceForm />,
});
