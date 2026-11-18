"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, Menu, Search, SlidersHorizontal, Settings } from "lucide-react";
import { getSpills } from "@/lib/api";
import { useAnalysis } from "@/components/AnalysisProvider";
import { formatDateTime } from "@/lib/format";

const USER_INITIALS = "VO";

function SearchField() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/spills?q=${encodeURIComponent(q)}` : "/spills");
  }

  return (
    <form onSubmit={submit} className="relative w-[420px] max-w-full">
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

  return (
    <header className="mb-6 flex items-center gap-3">
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => {
          window.dispatchEvent(new Event("doude:open-drawer"));
        }}
        className="icon-btn md:hidden"
      >
        <Menu className="h-[18px] w-[18px]" />
      </button>

      <div className="shrink-0">
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
              className="hidden min-[1280px]:flex"
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
          <button data-topbar-action type="button" aria-label="Settings" className="icon-btn">
            <Settings className="h-[18px] w-[18px]" />
          </button>
          <button data-topbar-action type="button" aria-label="Notifications" className="icon-btn relative">
            <Bell className="h-[18px] w-[18px]" />
            {hasDetected && (
              <span
                aria-label="New detected spill"
                className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-danger"
              />
            )}
          </button>
          <div
            data-topbar-action
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