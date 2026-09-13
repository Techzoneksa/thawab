import { createFileRoute, useParams } from "@tanstack/react-router";
import { PaymentVoucherForm } from "@/components/finance/PaymentVoucherForm";

export const Route = createFileRoute("/finance/payment-vouchers_/$id/edit")({
  head: () => ({ meta: [{ title: "تعديل سند صرف — ثواب" }] }),
  component: EditPaymentVoucherPage,
});

function EditPaymentVoucherPage() {
  const { id } = useParams({ from: "/finance/payment-vouchers_/$id/edit" });
  return <PaymentVoucherForm voucherId={id} />;
}
