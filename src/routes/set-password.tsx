import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Lock, AlertCircle, KeyRound, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/set-password")({
  head: () => ({ meta: [{ title: "تعيين كلمة المرور — جاد كلاود" }] }),
  component: SetPasswordPage,
});

const API = "/api/auth-setup";

function getToken(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token") || "";
}

function SetPasswordPage() {
  const [token] = useState(getToken);
  const [state, setState] = useState<"loading" | "invalid" | "ready" | "done">("loading");
  const [who, setWho] = useState<{ name?: string; email?: string }>({});
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      if (!token) return setState("invalid");
      try {
        const res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "validate", token }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.valid) {
          setWho({ name: data.name, email: data.email });
          setState("ready");
        } else {
          setState("invalid");
        }
      } catch {
        setState("invalid");
      }
    })();
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (pw.length < 8) return setError("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
    if (pw !== confirm) return setError("كلمتا المرور غير متطابقتين");
    setSaving(true);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", token, newPassword: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setError(data.message || data.error || "تعذّر تعيين كلمة المرور");
        setSaving(false);
        return;
      }
      setState("done");
    } catch {
      setError("حدث خطأ في الاتصال بالخادم");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <KeyRound size={24} />
          </div>
          <h1 className="text-2xl font-extrabold text-primary">جاد كلاود</h1>
        </div>

        <Card className="p-6 lg:p-8">
          {state === "loading" && (
            <div className="text-center text-sm text-muted-foreground py-6">
              جارٍ التحقق من الرابط…
            </div>
          )}

          {state === "invalid" && (
            <div className="text-center py-4">
              <AlertCircle size={32} className="mx-auto text-destructive mb-2" />
              <h2 className="font-bold mb-1">الرابط غير صالح</h2>
              <p className="text-sm text-muted-foreground">
                انتهت صلاحية الرابط أو تم استخدامه من قبل. تواصل مع المسؤول لإرسال دعوة جديدة.
              </p>
              <a href="/login" className="mt-4 inline-block text-sm text-primary hover:underline">
                الذهاب لتسجيل الدخول
              </a>
            </div>
          )}

          {state === "done" && (
            <div className="text-center py-4">
              <CheckCircle2 size={32} className="mx-auto text-emerald-600 mb-2" />
              <h2 className="font-bold mb-1">تم تعيين كلمة المرور</h2>
              <p className="text-sm text-muted-foreground">يمكنك الآن تسجيل الدخول بحسابك.</p>
              <a
                href="/login"
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                تسجيل الدخول
              </a>
            </div>
          )}

          {state === "ready" && (
            <>
              <h2 className="text-lg font-bold text-center mb-1">تعيين كلمة المرور</h2>
              <p className="text-center text-xs text-muted-foreground mb-5">
                {who.name ? `مرحباً ${who.name} — ` : ""}
                {who.email}
              </p>
              {error && (
                <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}
              <form onSubmit={submit} className="space-y-4">
                <PwField
                  label="كلمة المرور"
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
                  disabled={saving}
                  className="w-full h-12 text-base font-semibold"
                >
                  {saving ? "جارٍ الحفظ..." : "حفظ كلمة المرور"}
                </Button>
              </form>
            </>
          )}
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
