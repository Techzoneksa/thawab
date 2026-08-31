import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Lock, AlertCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { showToast } from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";

export const Route = createFileRoute("/change-password")({
  head: () => ({ meta: [{ title: "تغيير كلمة المرور — جاد كلاود" }] }),
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const { token, logout } = useAuth();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (pw.length < 8) return setError("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
    if (pw !== confirm) return setError("كلمتا المرور غير متطابقتين");
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": token || "" },
        body: JSON.stringify({ action: "force_change_password", newPassword: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setError(data.message || data.error || "تعذّر تغيير كلمة المرور");
        setLoading(false);
        return;
      }
      showToast("تم تحديث كلمة المرور بنجاح", "success");
      // Full reload so the auth gate re-reads mustChangePassword = false.
      window.location.href = "/";
    } catch {
      setError("حدث خطأ في الاتصال بالخادم");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck size={24} />
          </div>
          <h1 className="text-2xl font-extrabold text-primary">تعيين كلمة مرور جديدة</h1>
          <p className="text-sm text-muted-foreground mt-1">
            لحماية حسابك، يجب تغيير كلمة المرور قبل المتابعة.
          </p>
        </div>

        <Card className="p-6 lg:p-8">
          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <PwField
              label="كلمة المرور الجديدة"
              value={pw}
              onChange={setPw}
              show={show}
              setShow={setShow}
            />
            <PwField
              label="تأكيد كلمة المرور"
              value={confirm}
              onChange={setConfirm}
              show={show}
              setShow={setShow}
            />
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-base font-semibold"
            >
              {loading ? "جارٍ الحفظ..." : "حفظ ومتابعة"}
            </Button>
          </form>

          <button
            onClick={() => logout()}
            className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            تسجيل الخروج
          </button>
        </Card>
      </div>
    </div>
  );
}

function PwField({
  label,
  value,
  onChange,
  show,
  setShow,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  setShow: (v: boolean) => void;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground block mb-1.5">{label}</label>
      <div className="relative">
        <Lock
          size={15}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type={show ? "text" : "password"}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border bg-background py-3 pr-10 pl-10 text-sm"
          placeholder="••••••••"
          dir="ltr"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}
