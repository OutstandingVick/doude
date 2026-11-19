"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Menu, Search, Settings, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useAnalysis } from "@/components/AnalysisProvider";
import { formatDateTime } from "@/lib/format";
import { NotificationsBell } from "@/components/NotificationsBell";
import { AvatarMenu } from "@/components/AvatarMenu";

function SearchField() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/spills?q=${encodeURIComponent(q)}` : "/spills");
  }

  return (
    <form onSubmit={submit} className="relative w-full">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search spills, pipelines or KM…"
        aria-label="Search spills, pipelines or KM"
        className="h-11 w-full rounded-[12px] bg-surface3 pl-10 pr-11 text-sm text-text outline-none placeholder:text-faint focus:ring-2 focus:ring-primary"
      />
      <button
        type="button"
        aria-label="Filter"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-text"
      >
        <SlidersHorizontal className="h-4 w-4" />
      </button>
    </form>
  );
}

export function TopNav() {
  const { analysis, scenario, error } = useAnalysis();

  return (
    <header className="mb-6 flex items-center gap-3">
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => {
          window.dispatchEvent(new Event("feasibility3d:open-drawer"));
        }}
        className="icon-btn md:hidden"
      >
        <Menu className="h-[18px] w-[18px]" />
      </button>

      <div className="min-w-[220px] flex-1">
        <SearchField />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2">
          <InfoChip label="Detected" value={formatDateTime(analysis?.leak?.detected_at)} />
          <InfoChip label="Shut in" value={formatDateTime(analysis?.leak?.shut_in_at)} />
          {error ? (
            <div className="chip hidden min-[1280px]:flex border border-danger/30 bg-danger/10">
              <span className="h-2 w-2 rounded-full bg-danger" />
              <span className="font-medium text-danger">Engine offline</span>
            </div>
          ) : (
            <InfoChip
              className="hidden min-[1440px]:flex"
              label="Pipeline"
              value={
                scenario?.pipeline
                  ? `${scenario.pipeline.id} / ${scenario.pipeline.type === "trunk_line" ? "Trunk line" : "Flow line"}`
                  : "—"
              }
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <Link data-topbar-action href="/settings" aria-label="Settings" className="icon-btn">
            <Settings className="h-[18px] w-[18px]" />
          </Link>
          <NotificationsBell />
          <AvatarMenu />
        </div>
      </div>
    </header>
  );
}

function InfoChip({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`chip shrink-0 ${className ?? ""}`}>
      <span className="whitespace-nowrap text-faint">{label}:</span>
      <span className="whitespace-nowrap font-medium text-text">{value}</span>
    </div>
  );
}