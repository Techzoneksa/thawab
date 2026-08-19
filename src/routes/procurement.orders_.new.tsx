import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell, Card, Btn } from "@/components/erp/AppShell";
import { ShoppingCart } from "lucide-react";

/**
 * Phase 3C.1 cutover — the legacy "new Purchase Order" form is retired. Creating a
 * NEW legacy PO would default governance_mode='legacy' and keep the unsafe legacy
 * receive path (Dr Inventory / Cr AP + suppliers.balance) alive, bypassing the
 * governed architecture. All new POs are created through the governed module. This
 * route no longer renders a create form and never calls the legacy create API; it
 * redirects to the governed Purchase Orders page.
 */
export const Route = createFileRoute("/procurement/orders_/new")({
  head: () => ({ meta: [{ title: "أمر شراء محكوم — ثواب" }] }),
  component: LegacyCreateRetired,
});

function LegacyCreateRetired() {
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => navigate({ to: "/procurement/purchase-orders" }), 1500);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "أوامر الشراء المحكومة"]}
      title="إنشاء أمر شراء"
    >
      <Card className="p-6 max-w-lg mx-auto text-center space-y-3">
        <div className="flex justify-center">
          <div className="rounded-full bg-primary/10 p-3">
            <ShoppingCart className="text-primary" size={28} />
          </div>
        </div>
        <div className="text-lg font-bold">تم نقل إنشاء أوامر الشراء</div>
        <div className="text-sm text-muted-foreground">
          لم تعد أوامر الشراء القديمة قابلة للإنشاء. تُنشأ جميع أوامر الشراء الجديدة عبر وحدة أوامر
          الشراء المحكومة (اعتماد وإصدار قبل الاستلام، بلا أي أثر محاسبي حتى الاستلام).
        </div>
        <Btn variant="primary" onClick={() => navigate({ to: "/procurement/purchase-orders" })}>
          الانتقال لأوامر الشراء المحكومة
        </Btn>
      </Card>
    </AppShell>
  );
}
