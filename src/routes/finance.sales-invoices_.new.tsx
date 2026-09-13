import { createFileRoute } from "@tanstack/react-router";
import { SalesInvoiceForm } from "@/components/finance/SalesInvoiceForm";

export const Route = createFileRoute("/finance/sales-invoices_/new")({
  head: () => ({ meta: [{ title: "فاتورة مبيعات جديدة — ثواب" }] }),
  component: () => <SalesInvoiceForm />,
});
