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

export function Sidebar() {
  const pathname = usePathname();

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
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item) ? "page" : undefined}
            className="flex h-11 items-center rounded-[12px] bg-surface3 px-4 text-sm font-medium text-text transition-colors hover:bg-border"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}