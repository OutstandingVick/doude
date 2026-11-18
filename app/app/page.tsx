"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useAnalysis } from "@/components/AnalysisProvider";
import { OfflineCard } from "@/components/OfflineCard";
import { Skeleton } from "@/components/Skeleton";
import { LeakRateChart } from "@/components/LeakRateChart";
import { SpillSnapshot } from "@/components/SpillSnapshot";
import { RegulatoryTimeline } from "@/components/RegulatoryTimeline";
import { ResponseIntegrity } from "@/components/ResponseIntegrity";
import { EmptyState } from "@/components/EmptyState";
import { getSpill } from "@/lib/api";
import type { SpillDetail } from "@/lib/types";

const HeroMap = dynamic(
  () => import("@/components/HeroMap").then((mod) => mod.HeroMap),
  { ssr: false },
);

// lg (1024–1279): map + leak rate on top, three cards below.
// xl (≥1280): map spans both rows on the left.
const SPAN_MAP = "min-h-0 md:col-span-2 lg:col-span-7 xl:col-span-5 xl:row-span-2";
const SPAN_CHART = "min-h-0 lg:col-span-5 xl:col-span-4";
const SPAN_SNAPSHOT = "min-h-0 lg:col-span-4 xl:col-span-3";
const SPAN_TIMELINE = "min-h-0 lg:col-span-4 xl:col-span-4";
const SPAN_INTEGRITY = "min-h-0 lg:col-span-4 xl:col-span-3";

const GRID =
  "grid min-h-0 flex-1 grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-12 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]";

export default function Dashboard() {
  const { analysis, scenario, readings, loading, refreshing, error, revision, runAnalysis } =
    useAnalysis();
  const [spill, setSpill] = useState<SpillDetail | null>(null);

  const spillId = analysis?.spill_id ?? null;

  useEffect(() => {
    if (!spillId) return;
    let cancelled = false;
    getSpill(spillId)
      .then((d) => {
        if (!cancelled) setSpill(d);
      })
      .catch(() => {
        if (!cancelled) setSpill(null);
      });
    return () => {
      cancelled = true;
    };
  }, [spillId, revision]);

  if (error) {
    return (
      <div className="card">
        <OfflineCard message={error} />
      </div>
    );
  }

  if (!loading && scenario && !analysis) {
    return (
      <div data-card className="card flex min-h-0 flex-1 items-center justify-center">
        <EmptyState
          icon={<span aria-hidden className="text-lg">◎</span>}
          title="No analysis recorded yet"
          description="Run the analysis to detect, locate and quantify a spill. Each run is added to the audit log."
          action={
            <button
              type="button"
              onClick={() => void runAnalysis()}
              disabled={refreshing}
              className="rounded-[12px] bg-primary px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {refreshing ? "Running…" : "Run analysis"}
            </button>
          }
        />
      </div>
    );
  }

  if (loading || !analysis || !scenario) {
    return (
      <div className={GRID}>
        <div className={SPAN_MAP}>
          <Skeleton className="h-full" />
        </div>
        <div className={SPAN_CHART}>
          <Skeleton className="h-full" />
        </div>
        <div className={SPAN_SNAPSHOT}>
          <Skeleton className="h-full" />
        </div>
        <div className={SPAN_TIMELINE}>
          <Skeleton className="h-full" />
        </div>
        <div className={SPAN_INTEGRITY}>
          <Skeleton className="h-full" />
        </div>
      </div>
    );
  }

  const status = spill?.status ?? "detected";
  const evidence = spill?.evidence ?? [];
  const auditCount = spill?.audit.length ?? 0;
  const id = spillId ?? "SPL-0001";

  return (
    <div className={GRID}>
      <div className={SPAN_MAP}>
        <div data-card className="card h-full overflow-hidden p-0">
          <HeroMap
            analysis={analysis}
            scenario={scenario}
            spillId={spillId}
            onRunAnalysis={runAnalysis}
          />
        </div>
      </div>

      <div className={SPAN_CHART}>
        <LeakRateChart analysis={analysis} readings={readings} />
      </div>

      <div className={SPAN_SNAPSHOT}>
        <SpillSnapshot
          analysis={analysis}
          scenario={scenario}
          spillId={id}
          evidence={evidence}
        />
      </div>

      <div className={SPAN_TIMELINE}>
        <RegulatoryTimeline analysis={analysis} spillId={id} status={status} />
      </div>

      <div className={SPAN_INTEGRITY}>
        <ResponseIntegrity
          analysis={analysis}
          spillId={id}
          auditCount={auditCount}
          evidenceCount={evidence.length}
        />
      </div>
    </div>
  );
}