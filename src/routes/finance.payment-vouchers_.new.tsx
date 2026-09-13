import { createFileRoute } from "@tanstack/react-router";
import { PaymentVoucherForm } from "@/components/finance/PaymentVoucherForm";

export const Route = createFileRoute("/finance/payment-vouchers_/new")({
  head: () => ({ meta: [{ title: "سند صرف جديد — ثواب" }] }),
  component: () => <PaymentVoucherForm />,
});
