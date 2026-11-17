"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, Settings } from "lucide-react";
import { getSpills } from "@/lib/api";

const NAV = [
  { href: "/", label: "Dashboard", exact: true },
  { href: "/spills", label: "Spills", exact: true },
  { href: "/evidence", label: "Evidence", exact: false },
  { href: "/reports", label: "Reports", exact: false },
  { href: "/compliance", label: "Compliance", exact: false },
];

const USER_INITIALS = "VO";

export function TopNav() {
  const pathname = usePathname();
  const [hasDetected, setHasDetected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSpills()
      .then((spills) => {
        if (cancelled) return;
        setHasDetected(spills[0]?.status === "detected");
      })
      .catch(() => {
        /* offline: no dot */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function isActive(item: (typeof NAV)[number]) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  return (
    <header className="mb-6">
      <div className="flex items-center gap-4">
        <Link
          href="/"
          aria-label="Doude home"
          className="shrink-0 text-[26px] font-semibold tracking-tight text-green"
        >
          doude
        </Link>

        <nav className="flex flex-1 justify-center gap-1.5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`h-8 rounded-[10px] px-3.5 text-[13px] font-medium transition-colors ${
                isActive(item)
                  ? "bg-text text-white"
                  : "bg-surface3 text-text hover:bg-border"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <button type="button" aria-label="Settings" className="icon-btn">
            <Settings className="h-[18px] w-[18px]" />
          </button>
          <button type="button" aria-label="Notifications" className="icon-btn relative">
            <Bell className="h-[18px] w-[18px]" />
            {hasDetected && (
              <span
                aria-label="New detected spill"
                className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-danger"
              />
            )}
          </button>
          <div
            aria-label="Account"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-green text-sm font-semibold text-white"
          >
            {USER_INITIALS}
          </div>
        </div>
      </div>
    </header>
  );
}