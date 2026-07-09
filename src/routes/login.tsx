import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Lock, Mail, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { showToast } from "@/components/erp/actions";

const API = "/api/auth";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "تسجيل الدخول — ثواب" }] }),
  component: LoginPage,
});

async function getCurrentUser() {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(API, {
      headers: { "x-session-token": localStorage.getItem("session_token") || "" },
    });
    const data = await res.json();
    return data.user;
  } catch {
    return null;
  }
}

export async function beforeLoad() {
  const user = await getCurrentUser();
  if (user) {
    throw redirect({ href: "/" });
  }
}

export default function LoginPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || "حدث خطأ أثناء تسجيل الدخول");
        setIsLoading(false);
        return;
      }

      localStorage.setItem("session_token", data.token);
      queryClient.setQueryData(["currentUser"], data.user);
      showToast(`مرحباً ${data.user.name}!`, "success");
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
          <h2 className="text-xl font-bold text-center mb-6">تسجيل الدخول</h2>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
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
                  placeholder="example@domain.sa"
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
                  className="w-full rounded-lg border bg-background py-3 pr-10 pl-3 text-sm"
                  placeholder="••••••••"
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

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 text-base font-semibold"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                  جاري التسجيل...
                </div>
              ) : (
                "تسجيل الدخول"
              )}
            </Button>
          </form>

          <div className="mt-6 p-4 rounded-lg bg-muted/50 text-xs space-y-2">
            <div className="font-semibold text-muted-foreground mb-2">بيانات الدخول التجريبية:</div>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <span>مدير النظام:</span>
              <span dir="ltr">saud@albir.org.sa / admin123</span>
              <span>محاسب:</span>
              <span dir="ltr">sara@albir.org.sa / acc123</span>
              <span>مدير:</span>
              <span dir="ltr">mohammed@albir.org.sa / mgr123</span>
              <span>موظف تبرعات:</span>
              <span dir="ltr">noura@albir.org.sa / don123</span>
              <span>منسق مشاريع:</span>
              <span dir="ltr">fahad@albir.org.sa / proj123</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
