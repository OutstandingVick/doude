"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FileText,
  FolderOpen,
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import { getSpills } from "@/lib/api";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/spills", label: "Spills", icon: ListChecks, exact: false },
  { href: "/evidence", label: "Evidence", icon: FolderOpen, exact: false },
  { href: "/reports", label: "Reports", icon: FileText, exact: false },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck, exact: false },
];

export function Sidebar() {
  const pathname = usePathname();
  const [spillCount, setSpillCount] = useState(0);

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
                active
                  ? "bg-text text-white"
                  : "bg-surface3 text-text hover:bg-[#e6e6e0]"
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
    </aside>
  );
}