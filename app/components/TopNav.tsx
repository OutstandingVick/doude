"use client";

import Link from "next/link";

export function TopNav() {
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
      </div>
    </header>
  );
}