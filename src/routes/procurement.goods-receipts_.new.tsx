import { createFileRoute } from "@tanstack/react-router";
import { GoodsReceiptForm } from "@/components/procurement/GoodsReceiptForm";

export const Route = createFileRoute("/procurement/goods-receipts_/new")({
  head: () => ({ meta: [{ title: "سند استلام جديد — ثواب" }] }),
  component: () => <GoodsReceiptForm />,
});
