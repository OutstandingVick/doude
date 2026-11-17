"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard", exact: true },
  { href: "/spills", label: "Spills", exact: true },
  { href: "/evidence", label: "Evidence", exact: false },
  { href: "/reports", label: "Reports", exact: false },
  { href: "/compliance", label: "Compliance", exact: false },
];

export function TopNav() {
  const pathname = usePathname();

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
      </div>
    </header>
  );
}