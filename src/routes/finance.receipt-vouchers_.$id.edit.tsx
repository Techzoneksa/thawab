import { createFileRoute, useParams } from "@tanstack/react-router";
import { ReceiptVoucherForm } from "@/components/finance/ReceiptVoucherForm";

export const Route = createFileRoute("/finance/receipt-vouchers_/$id/edit")({
  head: () => ({ meta: [{ title: "تعديل سند قبض — ثواب" }] }),
  component: EditReceiptVoucherPage,
});

function EditReceiptVoucherPage() {
  const { id } = useParams({ from: "/finance/receipt-vouchers_/$id/edit" });
  return <ReceiptVoucherForm voucherId={id} />;
}
