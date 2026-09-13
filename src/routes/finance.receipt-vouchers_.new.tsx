import { createFileRoute } from "@tanstack/react-router";
import { ReceiptVoucherForm } from "@/components/finance/ReceiptVoucherForm";

export const Route = createFileRoute("/finance/receipt-vouchers_/new")({
  head: () => ({ meta: [{ title: "سند قبض جديد — ثواب" }] }),
  component: () => <ReceiptVoucherForm />,
});
