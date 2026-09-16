import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Lock, Mail, User, AlertCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { showToast } from "@/components/erp/actions";

const API = "/api/auth-bootstrap";

export const Route = createFileRoute("/setup")({
  head: () => ({ meta: [{ title: "إعداد النظام — ثواب" }] }),
  beforeLoad: async () => {
    // Only reachable while the tenant DB is empty; otherwise send to login.
    if (typeof window === "undefined") return;
    try {
      const res = await fetch(API);
      const data = await res.json();
      if (!data.needsSetup) throw redirect({ href: "/login" });
    } catch (e) {
      if (e && typeof e === "object" && "href" in e) throw e; // re-throw redirect
    }
  },
  component: SetupPage,
});

function SetupPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
      return;
    }
    if (password !== confirm) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.message || "تعذّر إكمال الإعداد");
        setIsLoading(false);
        return;
      }
      queryClient.setQueryData(["currentUser"], data.user);
      showToast(`تم إنشاء حساب المدير — مرحباً ${data.user.name}!`, "success");
      window.location.href = "/";
    } catch {
      setError("حدث خطأ في الاتصال بالخادم");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-primary">ثواب</h1>
          <p className="text-sm text-muted-foreground mt-1">نظام إدارة الجمعيات والجهات الخيرية</p>
        </div>

        <Card className="p-6 lg:p-8">
          <div className="flex items-center justify-center gap-2 mb-2 text-primary">
            <ShieldCheck size={20} />
            <h2 className="text-xl font-bold text-center">الإعداد الأول</h2>
          </div>
          <p className="text-xs text-center text-muted-foreground mb-6">
            أنشئ حساب مدير النظام لهذه الجمعية. هذا الحساب يملك كامل الصلاحيات.
          </p>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <form onSubmit={handleSetup} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                اسم المدير
              </label>
              <div className="relative">
                <User
                  size={15}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border bg-background py-3 pr-10 pl-3 text-sm"
                  placeholder="الاسم الكامل"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                البريد الإلكتروني
              </label>
              <div className="relative">
                <Mail
                  size={15}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border bg-background py-3 pr-10 pl-3 text-sm"
                  placeholder="admin@domain.sa"
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                كلمة المرور
              </label>
              <div className="relative">
                <Lock
                  size={15}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border bg-background py-3 pr-10 pl-10 text-sm"
                  placeholder="8 أحرف على الأقل"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                تأكيد كلمة المرور
              </label>
              <div className="relative">
                <Lock
                  size={15}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-lg border bg-background py-3 pr-10 pl-3 text-sm"
                  placeholder="أعد إدخال كلمة المرور"
                  dir="ltr"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 text-base font-semibold"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                  جارٍ الإنشاء...
                </div>
              ) : (
                "إنشاء الحساب والدخول"
              )}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
