"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AnalysisProvider } from "@/components/AnalysisProvider";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { useSession } from "@/components/SessionProvider";

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <Loader2 className="h-6 w-6 animate-spin text-muted" />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { authenticated, loading } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    if (loading) return;
    if (isLoginPage && authenticated) router.replace("/");
    else if (!isLoginPage && !authenticated) router.replace("/login");
  }, [loading, isLoginPage, authenticated, router]);

  // The login page renders on its own, without the app chrome.
  if (isLoginPage) {
    return <>{children}</>;
  }

  // While we check the session, or when there is none, hold on a loader.
  if (loading || !authenticated) {
    return <FullScreenLoader />;
  }

  return (
    <AnalysisProvider>
      <div
        data-container
        className="mx-auto my-6 min-h-[calc(100vh-3rem)] w-[min(calc(100%-48px),1600px)] rounded-[28px] border border-border bg-container p-6 shadow-[0_20px_60px_rgba(0,0,0,0.06)] lg:h-[calc(100dvh-48px)] lg:overflow-hidden"
      >
        <div className="flex h-full gap-6">
          <Suspense fallback={null}>
            <Sidebar />
          </Suspense>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <Suspense fallback={null}>
              <TopNav />
            </Suspense>
            <div className="flex min-h-0 flex-1 flex-col">
              <Suspense fallback={null}>{children}</Suspense>
            </div>
          </div>
        </div>
      </div>
    </AnalysisProvider>
  );
}
