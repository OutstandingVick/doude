"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CircleHelp,
  FileText,
  FolderOpen,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Play,
  ShieldCheck,
} from "lucide-react";
import { getSpills } from "@/lib/api";
import { useAnalysis } from "@/components/AnalysisProvider";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/spills", label: "Spills", icon: ListChecks, exact: false },
  { href: "/evidence", label: "Evidence", icon: FolderOpen, exact: false },
  { href: "/reports", label: "Reports", icon: FileText, exact: false },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck, exact: false },
];

const USER_NAME = "Victor Ogbonna";
const USER_HANDLE = "Regulator view";
const USER_INITIALS = "VO";

export function Sidebar() {
  const pathname = usePathname();
  const { runAnalysis, refreshing } = useAnalysis();
  const [spillCount, setSpillCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSpills()
      .then((spills) => {
        if (!cancelled) setSpillCount(spills.length);
      })
      .catch(() => {
        /* offline: no badge */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function isActive(item: (typeof NAV)[number]) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  async function handleRunAnalysis() {
    try {
      const before = new Set((await getSpills()).map((s) => s.id));
      const result = await runAnalysis();
      const id = result?.spill_id;
      if (id) {
        const isNew = !before.has(id);
        setToast(isNew ? `Saved as ${id}` : `Identical result — already recorded as ${id}`);
      }
    } catch {
      setToast("Analysis failed — is the engine running?");
    }
    window.setTimeout(() => setToast(null), 4000);
  }

  return (
    <aside className="sticky top-6 hidden h-[calc(100vh-7rem)] w-[232px] shrink-0 flex-col border-r border-surface3 pr-6 md:flex">
      <div className="pt-2">
        <Link
          href="/"
          aria-label="Doude home"
          className="text-[26px] font-semibold tracking-tight text-green"
        >
          doude
        </Link>
        <div className="mt-0.5 text-xs text-faint">Spill intelligence</div>
      </div>

      <nav aria-label="Main" className="mt-7 flex flex-col gap-2">
        {NAV.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 items-center gap-3 rounded-[12px] px-4 text-sm font-medium transition-colors ${
                active ? "bg-text text-white" : "bg-surface3 text-text hover:bg-[#e6e6e0]"
              }`}
            >
              <Icon
                className={`h-[18px] w-[18px] shrink-0 ${active ? "text-white" : "text-muted"}`}
              />
              <span>{item.label}</span>
              {item.href === "/spills" && spillCount > 0 && (
                <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-text">
                  {spillCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={handleRunAnalysis}
        disabled={refreshing}
        className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-primary text-sm font-medium text-text transition-colors hover:bg-primary-dark disabled:opacity-60"
      >
        {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        Run analysis
      </button>

      <div className="mt-auto">
        <Link
          href="/docs"
          className="flex h-11 items-center gap-3 rounded-[12px] px-4 text-sm font-medium text-muted transition-colors hover:bg-surface3 hover:text-text"
        >
          <CircleHelp className="h-[18px] w-[18px] shrink-0" />
          Help &amp; docs
        </Link>
        <div className="my-4 h-px bg-surface3" />
        <div className="flex items-center gap-3 px-1">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green text-xs font-semibold text-white">
            {USER_INITIALS}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm text-text">{USER_NAME}</div>
            <div className="truncate text-xs text-faint">{USER_HANDLE}</div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[10px] bg-text px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </aside>
  );
}