"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  CircleHelp,
  FileText,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Plug,
  Plus,
  Play,
  ShieldCheck,
} from "lucide-react";
import { getSpills, runAnalysis } from "@/lib/api";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/spills", label: "Spill register", icon: ListChecks, exact: true },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck, exact: false },
  { href: "/reports", label: "Reports", icon: FileText, exact: false },
  { href: "/integrations", label: "Integrations", icon: Plug, exact: false },
];

const USER_NAME = "Victor Ogbonna";
const USER_HANDLE = "Regulator view";
const USER_INITIALS = USER_NAME.split(" ")
  .map((word) => word[0])
  .join("")
  .toUpperCase();

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function handleRunAnalysis() {
    setRefreshing(true);
    try {
      const before = new Set((await getSpills()).map((s) => s.id));
      const result = await runAnalysis();
      const id = result.spill_id;
      if (id) {
        const isNew = !before.has(id);
        setToast(isNew ? `Saved as ${id}` : `Identical result — already recorded as ${id}`);
        router.push(`/spills/${id}`);
        window.setTimeout(() => setToast(null), 4000);
      }
    } catch {
      setToast("Analysis failed — is the engine running?");
      window.setTimeout(() => setToast(null), 4000);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <aside className="sticky top-0 flex h-screen w-[248px] shrink-0 flex-col border-r border-border bg-surface">
        <div className="px-5 pb-4 pt-6">
          <div className="text-lg font-semibold tracking-tight text-text">Doude</div>
          <div className="mt-0.5 text-xs text-muted">Spill intelligence</div>
        </div>

        <div className="flex items-stretch gap-1 px-5">
          <button
            type="button"
            onClick={handleRunAnalysis}
            disabled={refreshing}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-bg transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run analysis
          </button>
          <button
            type="button"
            aria-label="New analysis"
            onClick={handleRunAnalysis}
            disabled={refreshing}
            className="flex w-9 items-center justify-center rounded-lg bg-primary text-bg transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <nav className="mt-4 flex-1 space-y-0.5 px-3">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
                  active ? "bg-surface2 text-text" : "text-muted hover:bg-surface2/60 hover:text-text"
                }`}
              >
                {active && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />}
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-4">
          <Link href="/docs" className="flex items-center gap-2 text-sm text-muted hover:text-text">
            <CircleHelp className="h-4 w-4" />
            Help &amp; docs
          </Link>
          <div className="my-3 h-px bg-border" />
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface2 text-xs font-semibold text-text">
              {USER_INITIALS}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm text-text">{USER_NAME}</div>
              <div className="truncate text-xs text-muted">{USER_HANDLE}</div>
            </div>
          </div>
        </div>
      </aside>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}