"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  CircleHelp,
  ChevronsLeft,
  ChevronsRight,
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
const STORAGE_KEY = "feasibility3d-sidebar-collapsed";
const OPEN_DRAWER_EVENT = "feasibility3d:open-drawer";

function readStoredCollapsed(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function useMediaQuery(query: string): boolean {
  // useSyncExternalStore renders the server value (false) during hydration
  // and then switches to the real value, avoiding a hydration mismatch.
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { runAnalysis, refreshing } = useAnalysis();
  const [spillCount, setSpillCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isMobile = useMediaQuery("(max-width: 767px)");
  const isNarrow = useMediaQuery("(max-width: 1279px)");

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

  useEffect(() => {
    function open() {
      setDrawerOpen(true);
    }
    window.addEventListener(OPEN_DRAWER_EVENT, open);
    return () => window.removeEventListener(OPEN_DRAWER_EVENT, open);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

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

  const effectiveCollapsed = !isMobile && (collapsed || isNarrow);

  function renderInner(c: boolean) {
    return (
      <>
        <div className="flex items-center justify-between pt-2">
          {c ? (
            <Link
              href="/"
              aria-label="Feasibility3D home"
              className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-green text-lg font-semibold text-white"
            >
              d
            </Link>
          ) : (
            <div className="pr-8">
              <Link
                href="/"
                aria-label="Feasibility3D home"
                className="text-[26px] font-semibold tracking-tight text-green"
              >
                feasibility3d
              </Link>
              <div className="mt-0.5 text-xs text-faint">Spill intelligence</div>
            </div>
          )}
          {!isMobile && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={c ? "Expand sidebar" : "Collapse sidebar"}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface3 text-muted transition-colors hover:text-text"
            >
              {c ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </button>
          )}
        </div>

        <nav aria-label="Main" className="mt-7 flex flex-col gap-2">
          {NAV.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            if (c) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex h-11 w-11 items-center justify-center rounded-[12px] transition-colors ${
                    active
                      ? "bg-text text-white"
                      : "bg-surface3 text-muted hover:bg-[#e6e6e0] hover:text-text"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                  <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md bg-text px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {item.label}
                  </span>
                </Link>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-11 items-center gap-3 rounded-[12px] px-4 text-sm font-medium transition-colors ${
                  active ? "bg-text text-white" : "bg-surface3 text-text hover:bg-[#e6e6e0]"
                }`}
              >
                <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-white" : "text-muted"}`} />
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
          aria-label="Run analysis"
          className={`mt-6 flex items-center justify-center gap-2 rounded-[12px] bg-primary font-medium text-text transition-colors hover:bg-primary-dark disabled:opacity-60 ${
            c ? "h-11 w-11" : "h-11 w-full text-sm"
          }`}
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {!c && "Run analysis"}
        </button>

        <div className="mt-auto">
          <Link
            href="/docs"
            aria-label="Help and docs"
            className={`flex h-11 items-center gap-3 rounded-[12px] text-sm font-medium text-muted transition-colors hover:bg-surface3 hover:text-text ${
              c ? "justify-center px-0" : "px-4"
            }`}
          >
            <CircleHelp className="h-[18px] w-[18px] shrink-0" />
            {!c && "Help & docs"}
          </Link>
          <div className="my-4 h-px bg-surface3" />
          <div className={`flex items-center gap-3 ${c ? "justify-center px-0" : "px-1"}`}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green text-xs font-semibold text-white">
              {USER_INITIALS}
            </div>
            {!c && (
              <div className="min-w-0">
                <div className="truncate text-sm text-text">{USER_NAME}</div>
                <div className="truncate text-xs text-faint">{USER_HANDLE}</div>
              </div>
            )}
          </div>
        </div>

        {toast && (
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[10px] bg-text px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </div>
        )}
      </>
    );
  }

  if (isMobile) {
    return (
      <>
        <div
          className={`fixed inset-y-0 left-0 z-50 flex w-[232px] flex-col border-r border-surface3 bg-container px-4 py-6 transition-transform duration-200 ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {renderInner(false)}
        </div>
        {drawerOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40"
            aria-hidden="true"
            onClick={() => setDrawerOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-surface3 px-4 ${
        effectiveCollapsed ? "w-[76px]" : "w-[232px]"
      }`}
    >
      {renderInner(effectiveCollapsed)}
    </aside>
  );
}