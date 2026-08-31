import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider, useAuth } from "@/lib/api/auth";

// Pages reachable without a session (login + the emailed set-password link).
const PUBLIC_PATHS = ["/login", "/set-password"];
// The forced first-login password-change screen (blocks the rest of the app).
const CHANGE_PW_PATH = "/change-password";

/**
 * Client-side guard:
 *  - unauthenticated users on a non-public path → /login
 *  - authenticated users flagged mustChangePassword → /change-password (blocked
 *    from every other page until they set a new password).
 */
function AuthGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = router.state.location.pathname;
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const mustChange = !!user?.mustChangePassword;

  useEffect(() => {
    if (isLoading) return;
    if (!user && !isPublic) {
      router.navigate({ to: "/login" });
    } else if (user && mustChange && pathname !== CHANGE_PW_PATH) {
      router.navigate({ to: CHANGE_PW_PATH });
    }
  }, [isLoading, user, mustChange, isPublic, pathname, router]);

  if (!isLoading && !user && !isPublic) return null;
  if (!isLoading && user && mustChange && pathname !== CHANGE_PW_PATH) return null;
  return <>{children}</>;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" dir="rtl">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          الصفحة التي تبحث عنها غير متوفرة أو تم نقلها.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" dir="rtl">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">تعذّر تحميل الصفحة</h1>
        <p className="mt-2 text-sm text-muted-foreground">حدث خطأ غير متوقع. حاول مرة أخرى.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            إعادة المحاولة
          </button>
          <a href="/" className="rounded-md border px-4 py-2 text-sm">
            الرئيسية
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no",
      },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "theme-color", content: "#ffffff" },
      { name: "mobile-web-app-capable", content: "yes" },
      { title: "ثواب — نظام إدارة الجمعيات والجهات الخيرية" },
      {
        name: "description",
        content: "نظام خاص لإدارة الجمعيات والجهات الخيرية في المملكة العربية السعودية.",
      },
      { name: "author", content: "Techzone" },
      { property: "og:title", content: "ثواب — نظام إدارة الجمعيات والجهات الخيرية" },
      {
        property: "og:description",
        content: "نظام خاص لإدارة الجمعيات والجهات الخيرية في المملكة العربية السعودية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "ثواب — نظام إدارة الجمعيات والجهات الخيرية" },
      {
        name: "twitter:description",
        content: "نظام خاص لإدارة الجمعيات والجهات الخيرية في المملكة العربية السعودية.",
      },
      { property: "og:image", content: "" },
      { name: "twitter:image", content: "" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate>
          <Outlet />
        </AuthGate>
      </AuthProvider>
    </QueryClientProvider>
  );
}
