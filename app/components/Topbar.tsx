"use client";

import Link from "next/link";
import { ChevronRight, ChevronDown, Download, Home } from "lucide-react";
import { useAnalysis } from "./AnalysisProvider";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface TopbarProps {
  title: string;
  breadcrumb: BreadcrumbItem[];
}

export function Topbar({ title, breadcrumb }: TopbarProps) {
  const { health, scenario, analysis } = useAnalysis();

  const online = health?.status === "ok";
  const pipeline = scenario?.pipeline;

  function handleExport() {
    if (!analysis) return;
    const blob = new Blob([JSON.stringify(analysis, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `doude-report-${analysis.pipeline_id}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  return (
    <header className="mb-6">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-[13px] text-muted">
          <Home className="h-3.5 w-3.5" />
          <span>/</span>
          {breadcrumb.map((item, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
              {item.href ? (
                <Link href={item.href} className="hover:text-text">
                  {item.label}
                </Link>
              ) : (
                <span className="text-text">{item.label}</span>
              )}
            </span>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${online ? "bg-success" : "bg-danger"}`}
          />
          <span className="text-[13px] text-muted">
            {online ? "Engine online" : "Engine offline"}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-[28px] font-semibold leading-tight text-text">
          {title}
        </h1>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
          >
            <span className="font-medium">
              {pipeline ? pipeline.id : "Loading…"}
            </span>
            <span className="text-muted">
              {pipeline?.type === "trunk_line" ? "Trunk line" : ""}
            </span>
            <ChevronDown className="h-4 w-4 text-muted" />
          </button>

          <button
            type="button"
            onClick={handleExport}
            disabled={!analysis}
            className="flex items-center gap-2 rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-text transition-colors hover:bg-surface2 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>
    </header>
  );
}