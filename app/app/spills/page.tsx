"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, LayoutList, LayoutGrid, X } from "lucide-react";
import { useAnalysis } from "@/components/AnalysisProvider";
import { Topbar } from "@/components/Topbar";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { Siren } from "lucide-react";
import { formatBbl, formatKm, formatUtc } from "@/lib/format";
import type { AnalyzeResponse } from "@/lib/types";

interface SpillRow {
  id: string;
  pipeline: string;
  terrain: string;
  volumeBbl: number;
  locationM: number;
  detectedAt: string;
  contained: boolean;
  verified: boolean;
}

function buildRow(analysis: AnalyzeResponse, verified: boolean): SpillRow {
  return {
    id: "SPL-0001",
    pipeline: analysis.pipeline_id,
    terrain: analysis.leak?.terrain ?? "water",
    volumeBbl: analysis.quantification?.volume_bbl ?? 0,
    locationM: analysis.leak?.location_m ?? 0,
    detectedAt: analysis.leak?.detected_at ?? "",
    contained: Boolean(analysis.leak?.shut_in_at),
    verified,
  };
}

export default function SpillsPage() {
  const { analysis, verification } = useAnalysis();
  const [view, setView] = useState<"list" | "grid">("list");

  if (!analysis) {
    return (
      <div>
        <Topbar title="Spill register" breadcrumb={[{ label: "Spill register" }]} />
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  const rows = analysis.detected
    ? [buildRow(analysis, verification?.repeatable ?? false)]
    : [];

  return (
    <div>
      <Topbar title="Spill register" breadcrumb={[{ label: "Spill register" }]} />

      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text"
        >
          Pipeline is {analysis.pipeline_id}
          <X className="h-3.5 w-3.5 text-muted" />
        </button>

        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5">
          <button
            type="button"
            onClick={() => setView("list")}
            aria-label="List view"
            className={`flex h-7 w-7 items-center justify-center rounded-md ${
              view === "list" ? "bg-surface2 text-text" : "text-muted"
            }`}
          >
            <LayoutList className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-label="Grid view"
            className={`flex h-7 w-7 items-center justify-center rounded-md ${
              view === "grid" ? "bg-surface2 text-text" : "text-muted"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Siren className="h-6 w-6" />}
          title="No spills detected on this pipeline"
          description="Run an analysis to check BYS-TL-01 for a deviation."
        />
      ) : view === "list" ? (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">ID</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Pipeline</th>
                <th className="px-5 py-3 font-medium">Terrain</th>
                <th className="px-5 py-3 font-medium">Volume (bbl)</th>
                <th className="px-5 py-3 font-medium">Location</th>
                <th className="px-5 py-3 font-medium">Detected</th>
                <th className="px-5 py-3 font-medium">Verified</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-surface2/50"
                >
                  <td className="px-5 py-4">
                    <Link href={`/spills/${row.id}`} className="text-primary">
                      {row.id}
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    <StatusPill
                      tone={row.contained ? "warn" : "danger"}
                      label={row.contained ? "Contained" : "Active"}
                    />
                  </td>
                  <td className="px-5 py-4 text-text">{row.pipeline}</td>
                  <td className="px-5 py-4 text-muted">
                    {row.terrain === "water" ? "Water" : "Land"}
                  </td>
                  <td className="px-5 py-4 tabular-nums text-text">
                    {formatBbl(row.volumeBbl)}
                  </td>
                  <td className="px-5 py-4 tabular-nums text-text">
                    {formatKm(row.locationM)}
                  </td>
                  <td className="px-5 py-4 text-muted">{formatUtc(row.detectedAt)}</td>
                  <td className="px-5 py-4">
                    {row.verified ? (
                      <span className="inline-flex items-center gap-1 text-xs text-success">
                        <Check className="h-3.5 w-3.5" /> Verified
                      </span>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/spills/${row.id}`}
              className="rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-surface2/50"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-primary">{row.id}</span>
                <StatusPill
                  tone={row.contained ? "warn" : "danger"}
                  label={row.contained ? "Contained" : "Active"}
                />
              </div>
              <div className="mt-4 text-[32px] font-semibold tabular-nums leading-none text-text">
                {formatBbl(row.volumeBbl)}
              </div>
              <div className="mt-1 text-sm text-muted">bbl released</div>
              <div className="mt-4 space-y-1 text-sm text-muted">
                <div className="flex justify-between">
                  <span>Pipeline</span>
                  <span className="text-text">{row.pipeline}</span>
                </div>
                <div className="flex justify-between">
                  <span>Location</span>
                  <span className="text-text">{formatKm(row.locationM)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Detected</span>
                  <span className="text-text">{formatUtc(row.detectedAt)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-muted">
        More pipelines appear here once connected to the Doude engine.
      </p>
    </div>
  );
}